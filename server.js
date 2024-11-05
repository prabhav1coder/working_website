const FormData = require('form-data');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer'); // Import multer for handling file uploads
const axios = require('axios'); // For sending requests to Flask server
const fs = require('fs');

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json()); // Enable JSON parsing
app.use(express.static(path.join(__dirname))); // Serve static files (HTML, CSS, JS)

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/app'); // Ensure proper connection options

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    dob: Date,
    username: { type: String, unique: true }, // Ensure username is unique
    password: String
});

const User = mongoose.model('User', userSchema);

// Setting up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, './uploads'); // Ensure this directory exists
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  });
  
  const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|webp|svg|avif/; // Allowed image types
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only images are allowed (jpeg, jpg, png, webp, svg, avif)'));
        }
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/create.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'create.html'));
});

// Login Handler
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (user && await bcrypt.compare(password, user.password)) {
            res.send("<script>alert('Successfully logged in!'); window.location.href = '/home.html';</script>");
        } else {
            res.send("<script>alert('Invalid username or password!'); window.location.href = '/login.html';</script>");
        }
    } catch (error) {
        console.error("Login Error:", error); // Log error for debugging
        res.send("<script>alert('Error during login!'); window.location.href = '/login.html';</script>");
    }
});

// Signup Handler
app.post('/create', async (req, res) => {
    const { name, email, phone, dob, username, password } = req.body;

    try {
        // Check if the username already exists
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            return res.send("<script>alert('Username already exists! Please choose another.'); window.location.href = '/create.html';</script>");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            phone,
            dob,
            username,
            password: hashedPassword
        });

        await newUser.save();
        res.send("<script>alert('Account created!'); window.location.href = '/login.html';</script>");
    } catch (error) {
        console.error("Error creating user:", error); // Log error for debugging
        if (error.code === 11000) { // Duplicate key error
            return res.send("<script>alert('Username already exists! Please choose another.'); window.location.href = '/create.html';</script>");
        }
        res.send("<script>alert('Error creating account! Please try again.'); window.location.href = '/create.html';</script>");
    }
});

// Route to handle image upload and send it to the Flask server
app.post('/process-image', upload.single('imageInput'), async (req, res) => {
    try {
        const formData = new FormData();
        formData.append('image', fs.createReadStream(path.join(__dirname, 'uploads', req.file.filename)));
        
        // Add the output format to the form data, default to 'JPEG'
        const outputFormat = req.body.output_format || 'JPEG';
        formData.append('output_format', outputFormat);

        const flaskResponse = await axios.post('http://localhost:5001/process-image', formData, {
            headers: formData.getHeaders(),
            responseType: 'arraybuffer'
        });

        const generatedImagePath = path.join(__dirname, 'generated', `generated_${Date.now()}.${outputFormat.toLowerCase()}`);
        fs.writeFileSync(generatedImagePath, Buffer.from(flaskResponse.data, 'binary'));
        console.log(`Generated image saved at: ${generatedImagePath}`);

        // Send the processed image
        res.contentType(`image/${outputFormat.toLowerCase()}`);
        res.send(Buffer.from(flaskResponse.data, 'binary'));
        
    } catch (error) {
        console.error("Image processing error:", error);
        res.status(500).send("Failed to process image");
    }
});

// Start server
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});