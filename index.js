require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

const uri =
  "mongodb+srv://studynookadmin:studynookadmin%40123@cluster0.6jy4tjj.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

function verifyToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).send("Unauthorized");

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send("Unauthorized");
    req.user = decoded;
    next();
  });
}

async function run() {
  await client.connect();

  const db = client.db("studynookDB");

  const roomsCollection = db.collection("rooms");
  const usersCollection = db.collection("users");
  const bookingsCollection = db.collection("bookings");

  console.log("MongoDB connected");

  app.get("/", (req, res) => {
    res.send("StudyNook API Running");
  });

  // USERS
  app.post("/users", async (req, res) => {
    const user = req.body;

    const exists = await usersCollection.findOne({
      email: user.email,
    });

    if (exists) return res.send(exists);

    const result = await usersCollection.insertOne(user);
    res.send(result);
  });

  // JWT
  app.post("/jwt", async (req, res) => {
    const user = req.body;

    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: false,
      })
      .send({ success: true });
  });

  // LOGOUT
  app.post("/logout", (req, res) => {
    res.clearCookie("token").send({ success: true });
  });

  // ALL ROOMS + SEARCH
  app.get("/rooms", async (req, res) => {
    const search = req.query.search || "";

    const query = {
      roomName: {
        $regex: search,
        $options: "i",
      },
    };

    const result = await roomsCollection.find(query).toArray();
    res.send(result);
  });

  // SINGLE ROOM
  app.get("/rooms/:id", async (req, res) => {
    const result = await roomsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  });

  // ADD ROOM
  app.post("/rooms", verifyToken, async (req, res) => {
    const room = req.body;
    room.ownerEmail = req.user.email;

    const result = await roomsCollection.insertOne(room);
    res.send(result);
  });

  // MY LISTINGS
  app.get("/my-listings", verifyToken, async (req, res) => {
    const result = await roomsCollection
      .find({ ownerEmail: req.user.email })
      .toArray();

    res.send(result);
  });

  // UPDATE ROOM
  app.patch("/rooms/:id", verifyToken, async (req, res) => {
    const result = await roomsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );

    res.send(result);
  });

  // DELETE ROOM
  app.delete("/rooms/:id", verifyToken, async (req, res) => {
    const result = await roomsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  });

  // BOOK ROOM
  app.post("/bookings", verifyToken, async (req, res) => {
    const booking = req.body;
    booking.userEmail = req.user.email;

    const result = await bookingsCollection.insertOne(booking);
    res.send(result);
  });

  // MY BOOKINGS
  app.get("/bookings", verifyToken, async (req, res) => {
    const result = await bookingsCollection
      .find({ userEmail: req.user.email })
      .toArray();

    res.send(result);
  });

  // CANCEL BOOKING
  app.delete("/bookings/:id", verifyToken, async (req, res) => {
    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  });
}

run().catch(console.dir);

app.listen(port, () => {
  console.log("Server running on", port);
});