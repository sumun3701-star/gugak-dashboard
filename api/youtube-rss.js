/* /api/youtube-rss — 유튜브 채널 RSS 피드 프록시 */
'use strict';
const { passthrough } = require('./_util');

module.exports = async (req, res) => {
  const ch = String((req.query && req.query.channel_id) || '');
  await passthrough(
    'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(ch),
    res
  );
};
