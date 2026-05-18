require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// mongodb uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6jy4tjj.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verify jwt middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden" });
    }

    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db("studynookDB");

    const usersCollection = db.collection("users");
    const roomsCollection = db.collection("rooms");
    const bookingsCollection = db.collection("bookings");

    // home route
    app.get("/", (req, res) => {
      res.send("StudyNook server running");
    });

    // save user
    app.post("/users", async (req, res) => {
      const user = req.body;

      const existing = await usersCollection.findOne({
        email: user.email,
      });

      if (existing) {
        return res.send(existing);
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // jwt create
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
          sameSite: "strict",
        })
        .send({ success: true });
    });

    // logout
    app.post("/logout", async (req, res) => {
      res.clearCookie("token").send({
        success: true,
      });
    });

    // add room
    app.post("/rooms", verifyToken, async (req, res) => {
      const room = req.body;

      room.createdAt = new Date();
      room.bookingCount = 0;
      room.owner = req.user.email;

      const result = await roomsCollection.insertOne(room);
      res.send(result);
    });

    // get all rooms
    app.get("/rooms", async (req, res) => {
      const search = req.query.search || "";
      const amenities = req.query.amenities;

      let query = {};

      if (search) {
        query.roomName = { $regex: search, $options: "i" };
      }

      if (amenities) {
        query.amenities = { $in: amenities.split(",") };
      }

      const result = await roomsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    // get single room
    app.get("/rooms/:id", async (req, res) => {
      const id = req.params.id;

      const result = await roomsCollection.findOne({
        _id: new ObjectId(id),
      });

      res.send(result);
    });

    // update room
    app.patch("/rooms/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updated = req.body;

      const result = await roomsCollection.updateOne(
        {
          _id: new ObjectId(id),
          owner: req.user.email,
        },
        {
          $set: updated,
        }
      );

      res.send(result);
    });

    // delete room
    app.delete("/rooms/:id", verifyToken, async (req, res) => {
      const id = req.params.id;

      const result = await roomsCollection.deleteOne({
        _id: new ObjectId(id),
        owner: req.user.email,
      });

      res.send(result);
    });

    app.get("/my-rooms", verifyToken, async (req, res) => {
  const result = await roomsCollection
    .find({ owner: req.user.email })
    .toArray();

  res.send(result);
});

    app.post("/bookings", verifyToken, async (req, res) => {
  const booking = req.body;

  const conflict = await bookingsCollection.findOne({
    roomId: booking.roomId,
    date: booking.date,
    status: "confirmed",
    startTime: booking.startTime,
    endTime: booking.endTime,
  });

  if (conflict) {
    return res.status(400).send({ message: "Time slot already booked" });
  }

  booking.status = "confirmed";
  booking.userEmail = req.user.email;
  booking.createdAt = new Date();

  const result = await bookingsCollection.insertOne(booking);

  await roomsCollection.updateOne(
    { _id: new ObjectId(booking.roomId) },
    { $inc: { bookingCount: 1 } }
  );

  res.send(result);
});

app.get("/my-bookings", verifyToken, async (req, res) => {
  const result = await bookingsCollection
    .find({ userEmail: req.user.email })
    .toArray();

  res.send(result);
});

app.patch("/bookings/:id/cancel", verifyToken, async (req, res) => {
  const id = req.params.id;

  const booking = await bookingsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!booking || booking.userEmail !== req.user.email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: "cancelled" } }
  );

  res.send(result);
});

    await client.connect();
    console.log("MongoDB connected");
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log("Server running on", port);
});