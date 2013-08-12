﻿var request = require('request');
var csvs = require('csv');

module.exports = function (client, channelName) {

	function random(min, max) {
		return min + Math.floor(Math.random() * ((max - min) + 1));
	}

	function searchPixiv(term) {
		//login disabled for now
		//var authJar = request.jar();
		//request({ url: 'http://spapi.pixiv.net/iphone/login.php?mode=login&pixiv_id=' + PIXIV_ID + '&pass=' + PIXIV_PASSWORD + '&skip=0', jar: authJar }, function (err, r, body) {
			request({ url: 'http://spapi.pixiv.net/iphone/search.php?s_mode=s_tag&word=' + encodeURIComponent(term) + '&PHPSESSID=0', jar: authJar }, function (err, r, body) {
				csv().from.string(body).to.array(function (arr) {
					arr = arr[random(0, arr.length - 1)];
					if (arr[4].length === 1) arr[4] = '0' + arr[4];

					client.emit('commands:image' + channelName, 'http://i1.pixiv.net/img' + arr[4] + '/img/' + arr[24] + '/' + arr[0] + '.' + arr[2]);
					client.say(channelName, (arr[26] === '1' ? '\x0304NSFW\x03 - ' : '') + arr[3] + ' [' + arr[5] + '] - http://pixiv.net/member_illust.php?mode=medium&illust_id=' + arr[0]);
				});
			});
		//});
	}

	function postInfo(id) {
		request('http://spapi.pixiv.net/iphone/illust.php?illust_id=' + id, function (err, r, data) {
			if (err) return;

			csv().from.string(data).to.array(function (arr) {
				arr = arr[0];
				client.say(channelName, (arr[26] === '1' ? '\x0304NSFW\x03 - ' : '') + arr[3] + ' [' + arr[5] + '] - http://pixiv.net/member_illust.php?mode=medium&illust_id=' + id);
			});
		});
	}

	return {
		commands: {
			pixiv: function (from, message) {
				searchPixiv(message);
			}
		},

		messageHandler: function (from, message) {
			var re, match;

			re = /https?:\/\/(www.)?pixiv.net\/member_illust.php\?((.+)&)?illust_id=([\d]+)/gi;
			while (match = re.exec(message)) {
				if (match[4]) {
					postInfo(match[4]);
				}
			}
		}
	};
};