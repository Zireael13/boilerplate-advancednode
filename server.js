/* eslint-disable import/order */
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const fccTesting = require("./freeCodeCamp/fcctesting.js");
const myDB = require("./connection");
const routes = require("./routes");
const auth = require("./auth");
const MongoStore = require("connect-mongo")(session);
const passportSocketIo = require("passport.socketio");
const cookieParser = require("cookie-parser");

const store = new MongoStore({ url: process.env.MONGO_URI });
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

fccTesting(app); // For FCC testing purposes
app.use("/public", express.static(`${process.cwd()}/public`));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "pug");
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false },
    store,
    key: "express.sid",
  })
);

function onAuthorizeSucess(data, accept) {
  console.log("successful connection to socket.io");
  accept(null, true);
}

function onAuthorizeFail(data, message, error, accept) {
  if (error) {
    throw new Error(message);
  }
  console.log("failed connection to socket.io");

  accept(null, false);
}

app.use(passport.initialize());
app.use(passport.session());

myDB(async (client) => {
  const myDataBase = await client.db("database").collection("users");
  let currentUsers = 0;

  io.use(
    passportSocketIo.authorize({
      cookieParser,
      key: "express.sid",
      secret: process.env.SESSION_SECRET,
      store,
      success: onAuthorizeSucess,
      fail: onAuthorizeFail,
    })
  );

  io.on("connection", (socket) => {
    currentUsers += 1;
    io.emit("user", {
      name: socket.request.user.name,
      currentUsers,
      connected: true,
    });
    console.log(`user ${socket.request.user.name} connected`);

    socket.on("chat message", (message) => {
      io.emit("chat message", {
        name: socket.request.user.name,
        message,
      });
    });

    socket.on("disconnect", () => {
      console.log(`user ${socket.request.user.name} disconnected`);
      currentUsers -= 1;
      io.emit("user", {
        name: socket.request.user.name,
        currentUsers,
        connected: false,
      });
    });
  });

  routes(app, myDataBase);
  auth(app, myDataBase);
}).catch((e) => {
  app.route("/").get((req, res) => {
    res.render("pug", { title: e, message: "Unable to login" });
  });
});

http.listen(process.env.PORT || 3000, () => {
  console.log(`Listening on port ${process.env.PORT}`);
});
