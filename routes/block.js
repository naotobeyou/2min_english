const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Report = require('../models/Report');

router.post('/', async (req, res) => {
  try {
    const currentUserId = req.session.userId;
    const { blockedUserId, reason, details } = req.body; 

    if (!blockedUserId) {
      return res.status(400).send('Missing blocked user ID');
    }

    if (currentUserId === blockedUserId) {
      return res.status(400).send('自分自身をブロックすることはできません');
    }

    // ログ出力（後で保存機能追加してもOK）
    console.log(`🔒 ブロック処理: ${currentUserId} → ${blockedUserId}`);
    console.log(`📝 通報理由: ${reason}`);
    console.log(`🗒️ 補足: ${details}`);

    // 🔒 ブロック処理
    await User.findByIdAndUpdate(
      currentUserId,
      { $addToSet: { blockedUsers: blockedUserId } }
    );

    // 📝 通報内容を保存
    await Report.create({
        reporter: currentUserId,
        reportedUser: blockedUserId,
        reason,
        details
      });

    res.redirect('/dashboard?blocked=1');
  } catch (err) {
    console.error('❌ ブロック処理中のエラー:', err);
    res.status(500).send('ブロック処理に失敗しました');
  }
});

module.exports = router;
