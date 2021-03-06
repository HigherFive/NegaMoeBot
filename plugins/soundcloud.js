var durationFormat = require('../utils.js').durationFormat;
var google = require('google');
var request = require('request');
var http = require('http');
var fs = require('fs');

try {
	var clientId = fs.readFileSync(__dirname + '/.soundcloud', { encoding: 'utf8' }).trim();
} catch (err) {
	console.error('Couldn\'t read soundcloud client id: ' + err);
	module.exports = function () { return {}; };

	return;
}


// song URLs look like this: https://soundcloud.com/<artist name>/<song name>
var songRegex = /^(?:https?:\/\/)?soundcloud\.com\/([^/ ]+)\/([^/ ]+)\/?$/i;
// set URLs look like this: https://soundcloud.com/<artist name>/sets/<set name>
var setRegex = /^(?:https?:\/\/)?soundcloud\.com\/([^/ ]+)\/sets\/([^/ ]+)\/?$/i;

// There are certain URLs that match the songRegex but are not in fact track URLs
// We explicitly check for these to skip over them in our google search.
// Examples are soundcloud.com/<artist name>/tracks, soundcloud.com/<artist name>/followers, etc.
// Note that this may not be an exhaustive list
var badTitleRegex = /^(tracks|sets|likes|following|followers|groups|comments|stats)$/i;

function parseLinks(str) {
	var strArr = str.trim().split(/\s+/);
	var match;
	var matches = [];
	for (var i = 0; i < strArr.length; i++) {
		// URLs may have a query string that we
		// don't care about it, so we just drop it
		strArr[i] = strArr[i].split('?')[0];

		if (match = strArr[i].match(songRegex)) {
			var song = {
				type: 'track',
				url: match[0],
				artist: match[1],
				title: match[2]
			};

			if (song.title.match(badTitleRegex))
				continue;

			matches.push(song);
		} else if (match = strArr[i].match(setRegex)) {
			matches.push({
				type: 'playlist',
				url: match[0],
				artist: match[1],
				title: match[2]
			});
		}
	}

	return matches;
}

function queryGoogle(query, cb) {
	google.resultsPerPage = 1;
	var url = 'site:soundcloud.com ' + query;
	google(url, function (err, next, links) {
		if (err) {
			if (err.status) {
				cb(new Error('Something went wrong while searching on Google: ' + err.status + ': ' + http['STATUS_CODES'][err.status]), null);
			} else {
				cb(new Error('Something went wrong while searching on Google: ' + err.message), null);
			}

			return;
		}

		if (links.length === 0) {
			cb(new Error('No results for: "' + query + '".'), null);

			return;
		}

		var matchArr = parseLinks(links[0].link);

		if (matchArr.length > 0) {
			cb(null, matchArr[0]);
		} else if (next) {
			next();
		} else {
			cb(new Error('No results for: "' + query + '".'), null);
		}
	});
}

function querySoundcloud(url, cb) {

	request.get(url, function(err, resp, body) {
		if (err) {
			cb(new Error('Something went wrong while querying Soundcloud: ' + err.message), null);

			return;
		}

		if (resp.statusCode < 200 || resp.statusCode >= 300) {
			cb(new Error('Something went wrong while querying Soundcloud: ' + resp.statusCode + ': ' + http['STATUS_CODES'][resp.statusCode]), null);

			return;
		}

		try {
			body = JSON.parse(body);
		} catch (e) {
			cb(new Error('Got bad data from Soundcloud for', url, ':', body), null);

			return;
		}

		cb(null, body);
	});
}

// We can use the same function for both tracks and
// sets, because they only differ in the count param
function format(data) {
	var duration = data.duration;
	var genre = data.genre;
	var title = data.title;
	var artist = data.user.username;

	// for some reason the permalink_url they give us is the only link with http
	// we prefer https though
	var link = data.permalink_url.replace(/^http:\/\//, 'https://');
	var count = data.track_count;

	return '[' + artist + '] ' + title + (genre ? ' \x0302#' + genre + '\x03' : '') + (count ? ' (' + count + ' tracks)' : '') + ' [' + durationFormat(Math.ceil(duration / 1000)) + '] [ ' + link + ' ]';
}

module.exports = function (client) {
	return {
		commands: {
			soundcloud: function (from, to, msg) {
				if (to === client.nick) {
					to = from;
				}

				queryGoogle(msg, function (err, result) {
					if (err) {
						client.say(to, err.message);

						return;
					}

					var requestURL = 'https://api.soundcloud.com/resolve.json?'
							+ 'client_id=' + clientId + '&'
							+ 'url=' + encodeURIComponent(result.url);

					querySoundcloud(requestURL, function (err, result) {
						if (err) {
							console.error('Error while processing ' + requestURL);
							console.error(err);

							client.say(to, err.message);

							return;
						} else if (result.errors) {
							console.error('Error while processing ' + requestURL);
							console.error(JSON.stringify(result.errors));

							client.say(to, 'Soundcloud reported an error: "' + JSON.stringify(result.errors) + '".');

							return;
						} else if (result.kind !== 'playlist' && result.kind !== 'track') {
							// If we're here, then despite our (halfassed at) best efforts,
							// we've queried soundcloud with a URL that's neither a track nor a set.
							// Bail.

							console.error('Object is neither track nor set: ' + requestURL);
							console.error(JSON.stringify(result));

							client.say(to, 'Failed to fetch a valid URL.');

							return;
						} else {
							var msg = format(result);
							client.say(to, msg);
						}
					});
				});
			},

			sc: function (from, to, msg) {
				this.soundcloud(from, to, msg);
			}
		},

		messageHandler: function (from, to, msg) {
			if (to === client.nick) {
				return;
			}

			var matches = parseLinks(msg);
			for (var i = 0; i < matches.length; i++) {
				(function (match) {
					var requestURL = 'https://api.soundcloud.com/resolve.json?'
							+ 'client_id=' + clientId + '&'
							+ 'url=' + encodeURIComponent(match.url);

					querySoundcloud(requestURL, function (err, result) {
						if (err) {
							console.error('Error while processing ' + requestURL);
							console.error(err);

							return;
						} else if (result.errors) {
							console.error('Error while processing ' + requestURL);
							console.error(JSON.stringify(result.errors));

							return;
						} else if (result.kind !== 'playlist' && result.kind !== 'track') {
							// If we're here, then despite our (halfassed at) best efforts,
							// we've queried soundcloud with a URL that's neither a track nor a set.
							// Bail.

							console.error('Object is neither track nor set: ' + requestURL);
							console.error(JSON.stringify(result));

							return;
						} else {
							var msg = format(result);
							client.say(to, msg);
						}
					});
				})(matches[i]);
			}
		}
	};
};
