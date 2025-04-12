const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
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


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });




// フォーム送信処理（DBに保存）
app.post('/register', upload.single('avatar'), async (req, res) => {
  console.log('📩 受け取ったデータ:', req.body);
  try {
    const { username, email, password, level, purpose, hobbies } = req.body;
    const avatar = req.file ? req.file.filename : 'default.png';


     // 事前に同じユーザーが存在するかチェック
    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.send(`
          <script>
            alert("⚠️ このユーザー名はすでに使われています！");
            history.back();
          </script>
        `);
      } else if (existingUser.email === email) {
        return res.send(`
          <script>
            alert("⚠️ このメールアドレスはすでに登録されています！");
            history.back();
          </script>
        `);
      }
    }

    const user = new User({ 
      username, 
      email, 
      password,
      level,
      purpose,
      hobbies,
      avatar
    });
    await user.save();

    console.log('保存されたユーザー:', user); // ここで確認！
    res.redirect('/dashboard');
  } catch (err) {
    console.error('❌ エラー内容:', JSON.stringify(err, null, 2));
  
    if (err.code === 11000) {
      if (err.keyPattern?.username || err.keyValue?.username) {
        return res.send(`
          <script>
            alert("⚠️ このユーザー名はすでに使われています！");
            history.back();
          </script>
        `);
      } else if (err.keyPattern?.email || err.keyValue?.email) {
        return res.send(`
          <script>
            alert("⚠️ このメールアドレスはすでに登録されています！");
            history.back();
          </script>
        `);
      } else {
        return res.send(`
          <script>
            alert("⚠️ 登録情報に重複があります！");
            history.back();
          </script>
        `);
      }
    }
  
    res.status(500).send('登録エラー');
  }
});


app.get('/dashboard', async (req, res) => {
  // ★ 仮に「最初のユーザー」を取得（ログイン機能はまだ）
  const user = await User.findOne(); // 今は1人目のユーザーを使うだけ！

  if (!user) return res.send('ユーザーが見つかりません');

  res.render('dashboard', { user });
});

// サーバー起動
app.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});

