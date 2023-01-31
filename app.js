require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const https = require("https");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const { doesNotReject } = require("assert");
const today = new Date();
const pass = process.env.PASSWORD;

const app = express();

app.use(express.static("public"));
app.set("view engine","ejs");
app.use(bodyParser.urlencoded({extended:true}));
app.use(session({
	secret : process.env.SECRET,
	resave : false,
	saveUninitialized : false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://admin-kritagya:"+pass+"@cluster1.bjcgamc.mongodb.net/userDB",{useNewUrlParser : true});
// mongoose.set("useCreateIndex", true);

const bookSchema = {
	cover : String,
	title : String,
	author : String,
	bookID : Number
}

const Book = mongoose.model("Book", bookSchema);

const userSchema = new mongoose.Schema({
	email : String,
	username : String,
	password : String,
	googleId : String,
	books : [bookSchema]
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User",userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done){
    done(null, user.id);
});

passport.deserializeUser(function(id, done){
    User.findById(id, function(err, user){
        done(err, user);
    });
});

//to hold username and password
var uname;

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://encouraging-overcoat-newt.cyclic.app/auth/google/home"
  },
  function(accessToken, refreshToken, profile, cb) {
	uname = profile.displayName;
    User.findOrCreate({ googleId: profile.id },{ username: profile.displayName}, function (err, user) {
      return cb(err, user);
    });
  }
));



app.get("/home",function(req,res){
	const month = today.getMonth() + 1;
	const year = today.getFullYear();
	var auth = req.isAuthenticated();

	const options = {
		"method": "GET",
		"hostname": "hapi-books.p.rapidapi.com",
		"port": null,
		"path": "/month/"+year+"/"+month,
		"headers": {
			"X-RapidAPI-Key": process.env.API_KEY,
			"X-RapidAPI-Host": "hapi-books.p.rapidapi.com",
			"useQueryString": true
		}
	};
	
	const request = https.request(options, function (response) {
		response.on("data", function(data){
			const bookData = JSON.parse(data);
			console.log(bookData);
			res.render("home",{bookD : bookData, mon : month, yr : year, auths : auth});
		})
		
	});
	
	request.end();
});

app.post("/home",function(req, res){
	var auth = req.isAuthenticated();
	var searched = req.body.searchBook;
	var arr = searched.split(" ");
	var resultingarr = arr.join("+");
	console.log(resultingarr);
	const options = {
		"method": "GET",
		"hostname": "hapi-books.p.rapidapi.com",
		"port": null,
		"path": "/search/"+resultingarr,
		"headers": {
			"X-RapidAPI-Key": process.env.API_KEY,
			"X-RapidAPI-Host": "hapi-books.p.rapidapi.com",
			"useQueryString": true
		}
	};
	const request = https.request(options, function(response){
		response.on("data",function(data){
			const bookData = JSON.parse(data);
			res.render("homesearch",{bookD : bookData, auths : auth});
		})
	})
	request.end();
});

app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] }));

app.get("/auth/google/home", 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/profile");
  });

app.get("/add",function(req, res){
	if(req.isAuthenticated()){
		res.render("add");
	}else {
		res.redirect("/signup");
	}
	
});

app.post("/add",function(req, res){
	var bookiD = req.body.bookID;
	var i;
	const options = {
		"method": "GET",
		"hostname": "hapi-books.p.rapidapi.com",
		"port": null,
		"path": "/book/"+bookiD,
		"headers": {
			"X-RapidAPI-Key": process.env.API_KEY,
			"X-RapidAPI-Host": "hapi-books.p.rapidapi.com",
			"useQueryString": true
		}
	};
		
	const request = https.request(options, function (response) {
		response.on("data",function(data){
			const bookData = JSON.parse(data);
			const book = new Book({
				cover : bookData.cover,
				title : bookData.name,
				author : bookData.authors,
				bookID : bookData.book_id
			});
			const id = book.bookID;
			User.findOne({username : uname}, function(err, foundUser){
				if(err){
					console.log(err);
				}else {
					foundUser.books.push(book);
					foundUser.save();
					res.redirect("/profile");	
				}
			});
		});
	});
		
	request.end();
});

app.get("/signup",function(req,res){
	res.render("signup");
});

app.post("/signup",function(req,res){
	User.findOne({username : req.body.username}, function(err,foundUser){
		if(!err){
			if(foundUser){
				console.log("Username already exist");
				res.redirect("/signup");
			} else {
				User.register({username : req.body.username}, req.body.password, function(err, user){
					if(err){
						console.log(err);
						res.redirect("/signup");
					}else {
						uname = req.body.username;
						passport.authenticate("local")(req, res, function(){
							res.redirect("/profile");
						});
					}
				});
			}
		}
	})
	
});

app.get("/login",function(req,res){
	res.render("login");
});

app.post("/login",function(req, res){
	uname = req.body.username;
	const user = new User({
		username : req.body.username,
		password : req.body.password
	});
	req.login(user, function(err){
		if(err){
			console.log(err);
		}else {
			passport.authenticate("local")(req, res, function(){
				res.redirect("/profile");
			});
		}
	});
});

app.get("/profile",function(req, res){
	if(req.isAuthenticated()){
		User.findOne({username : uname},function(err, foundUser){
			if(err){
				res.render("profile",{name : uname});
			}else {
				res.render("profile",{name : uname, bookDetail : foundUser.books})
			}
		})
		
	}else {
		res.redirect("/signup");
	}
});

app.post("/profile",function(req, res){
	if(req.isAuthenticated()){
		var delname = parseInt(req.body.hid);
		User.findOneAndUpdate({username : uname},{$pull : {books : {bookID : delname}}},function(err, foundUser){
			if(!err){
				console.log("olo");
				res.redirect("/profile");
			}
		})	
	}
});

app.get("/logout", function(req, res){
	req.logout(function(err){
		if(err){
			console.log(err);
		}else {
			res.redirect("/home");
		}
	});
});

app.listen(process.env.PORT || 3000,function(){
    console.log("Server is running on port 3000");
});