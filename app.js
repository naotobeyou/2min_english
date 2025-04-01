const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// ミドルウェア設定
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// MongoDB接続
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB 接続成功！'))
  .catch((err) => console.error('❌ 接続エラー:', err));

// モデル読み込み
const User = require('./models/User');

// 新規登録ページ表示
app.get('/register', (req, res) => {
  res.render('register');
});

// フォーム送信処理（DBに保存）
app.post('/register', async (req, res) => {
  console.log('📩 受け取ったデータ:', req.body);
  try {
    const { username, email, password } = req.body;

    const user = new User({ username, email, password });
    await user.save();

    console.log('保存されたユーザー:', user); // ここで確認！
    res.send('登録完了！');
  } catch (err) {
    console.error(err);
    res.status(500).send('登録エラー');
  }
});

// サーバー起動
app.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});

