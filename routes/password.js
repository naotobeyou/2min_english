// routes/password.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();


router.get('/forgot-password', (req, res) => {
  res.render('forgot-password');  // EJSファイル名と一致させる
});

module.exports = router;

// MongoDBに追加する: パスワードリセット用トークンと有効期限をUserスキーマに追加しておいてください。

// POST: パスワードリセットリンクのリクエスト
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.send('<script>alert("ユーザーが見つかりません"); history.back();</script>');

    const token = crypto.randomBytes(20).toString('hex');
    console.log('🔗 リセットトークン:', token); 
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1時間有効
    await user.save();

    const transporter = nodemailer.createTransport({
      service: process.env.MAIL_SERVICE, // 他のメールプロバイダでもOK（下記に補足）
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
      }
    });

    const mailOptions = {
      to: user.email,
      from: process.env.MAIL_USER,
      subject: '【2min English】パスワード再設定',
      text: `以下のリンクからパスワードをリセットできます（有効期限: 1時間）:\n\nhttp://localhost:3000/reset-password/${token}`
    };

    await transporter.sendMail(mailOptions);
    res.send('<script>alert("パスワードリセット用のメールを送信しました"); window.location.href = "/login";</script>');
  } catch (err) {
    console.error(err);
    res.status(500).send('リセットリクエストに失敗しました');
  }
});

// GET: パスワードリセット画面
router.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) return res.send('<script>alert("無効または期限切れのトークンです"); window.location.href = "/login";</script>');
  res.render('reset-password', { token });
});

// POST: パスワードの変更処理
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.send('<script>alert("パスワードが一致しません"); history.back();</script>');
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.send('<script>alert("トークンが無効または期限切れです"); window.location.href = "/login";</script>');

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.send('<script>alert("パスワードを変更しました"); window.location.href = "/login";</script>');
  } catch (err) {
    console.error(err);
    res.status(500).send('パスワードの変更に失敗しました');
  }
});

module.exports = router;
