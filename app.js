const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));



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
    res.render('dashboard', { user }); 



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

//ダッシュボードget
app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  const user = await User.findById(req.session.userId);
  if (!user) return res.send('ユーザーが見つかりません');

  res.render('dashboard', { user });
});


//ログインget
app.get('/login', (req, res) => {
  res.render('login');
});

const bcrypt = require('bcryptjs'); // 念のため再確認！

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user) {
      return res.send('<script>alert("ユーザーが見つかりません");history.back();</script>');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.send('<script>alert("パスワードが間違っています");history.back();</script>');
    }

    // ログイン成功時
    req.session.userId = user._id;
    console.log('🧠 セッションの中身:', req.session);
    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    res.status(500).send('ログインエラー');
  }
});


//ログアウト

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('ログアウトエラー:', err);
      return res.status(500).send('ログアウトできませんでした');
    }
    // 🔁 ログアウト後に /register にリダイレクト！
    res.redirect('/register');
  });
});

// サーバー起動
app.listen(3000, () => {
  console.log('http://localhost:3000 でサーバー起動中');
});

