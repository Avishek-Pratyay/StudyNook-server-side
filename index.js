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

  app.get("/", (req, res) => {
    res.send("StudyNook API Running");
  });

  app.post("/users", async (req, res) => {
    const user = req.body;

    const exists = await usersCollection.findOne({ email: user.email });
    if (exists) return res.send(exists);

    const result = await usersCollection.insertOne(user);
    res.send(result);
  });

  app.post("/jwt", async (req, res) => {
    const token = jwt.sign(
      { email: req.body.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
    }).send({ success: true });
  });

  app.post("/logout", (req, res) => {
    res.clearCookie("token").send({ success: true });
  });

  app.get("/rooms", async (req, res) => {
    const search = req.query.search || "";

    const result = await roomsCollection.find({
      roomName: { $regex: search, $options: "i" },
    }).toArray();

    res.send(result);
  });

  app.get("/rooms/latest", async (req, res) => {
    const result = await roomsCollection
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();

    res.send(result);
  });

  app.get("/rooms/:id", async (req, res) => {
    const result = await roomsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  });

  app.post("/rooms", verifyToken, async (req, res) => {
    const room = req.body;
    room.ownerEmail = req.user.email;
    room.bookingCount = 0;

    const result = await roomsCollection.insertOne(room);
    res.send(result);
  });

  app.get("/my-listings", verifyToken, async (req, res) => {
    const result = await roomsCollection
      .find({ ownerEmail: req.user.email })
      .toArray();

    res.send(result);
  });

  app.patch("/rooms/:id", verifyToken, async (req, res) => {
    const room = await roomsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (room.ownerEmail !== req.user.email) {
      return res.status(403).send("Forbidden");
    }

    const result = await roomsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: req.body }
    );

    res.send(result);
  });

  app.delete("/rooms/:id", verifyToken, async (req, res) => {
    const room = await roomsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (room.ownerEmail !== req.user.email) {
      return res.status(403).send("Forbidden");
    }

    await bookingsCollection.deleteMany({
      roomId: req.params.id,
    });

    const result = await roomsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  });

  app.post("/bookings", verifyToken, async (req, res) => {
    const booking = req.body;
    booking.userEmail = req.user.email;
    booking.status = "confirmed";

    const conflict = await bookingsCollection.findOne({
      roomId: booking.roomId,
      date: booking.date,
      startTime: booking.startTime,
      status: "confirmed",
    });

    if (conflict) {
      return res.status(400).send("Time slot already booked");
    }

    const result = await bookingsCollection.insertOne(booking);

    await roomsCollection.updateOne(
      { _id: new ObjectId(booking.roomId) },
      { $inc: { bookingCount: 1 } }
    );

    res.send(result);
  });

  app.get("/bookings", verifyToken, async (req, res) => {
    const result = await bookingsCollection
      .find({ userEmail: req.user.email })
      .toArray();

    res.send(result);
  });

  app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
    const booking = await bookingsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).send("Forbidden");
    }

    await bookingsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "cancelled" } }
    );

    res.send({ success: true });
  });
}

run().catch(console.dir);

app.listen(port, () => {
  console.log("Server running on", port);
});