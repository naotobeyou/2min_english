const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// 新規登録ページ
app.get('/register', (req, res) => {
  res.render('register'); // views/register.ejs を表示
});

// フォーム送信処理（まだ何もしない）
app.post('/register', (req, res) => {
  console.log(req.body); // フォームデータがここに入る
  res.send('登録情報を受け取りました！');
});

app.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});