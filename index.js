/** @format */

const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);
const port = process.env.PORT || 3000;

//middleware
app.use(cors());
app.use(express.json());

// Verify JWT TOken ----

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ro7xucx.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    client.connect();

    const userCollection = client.db("summer-camp").collection("users");
    const coursesCollection = client.db("summer-camp").collection("courses");
    const reviewCollection = client.db("summer-camp").collection("reviews");
    const enrollClassCollection = client
      .db("summer-camp")
      .collection("enrollClass");
    const paymentCollection = client.db("summer-camp").collection("payment");

    // jwt token

    app.post("/jwt", (req, res) => {
      const user = req.body;
      console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });

      res.send({ token });
    });

    //verify admin or instructor
    const verifyAdminOrInstructor = async (req, res, next) => {
      const email = req.decoded.email;

      const query = { email: email };
      const user = await userCollection.findOne(query);

      if (user?.role !== "admin" && user?.role !== "instructor") {
        console.log("failed");
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      // console.log("pass,role", user?.role);
      next();
    };
    //normal user routes
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    //for check user role
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });

      res.send(user);
    });

    // delete user

    app.delete(
      "/users/:id",
      verifyJWT,
      verifyAdminOrInstructor,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const deletedUser = await userCollection.deleteOne(query);

        res.send(deletedUser);
      }
    );
    // save user data
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already existing" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch(
      "/users/:id",
      verifyJWT,
      verifyAdminOrInstructor,
      async (req, res) => {
        const role = req.body.role;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: role,
          },
        };
        const updatedUser = await userCollection.updateOne(query, updateDoc);

        res.send(updatedUser);
      }
    );

    app.delete(
      "/users/:id",
      verifyJWT,
      verifyAdminOrInstructor,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const deletedUser = await userCollection.deleteOne(query);

        res.send(deletedUser);
      }
    );

    // ====================== courses routes ===========================
    app.get("/courses", async (req, res) => {
      const courses = await coursesCollection.find().toArray();
      res.send(courses);
    });

    // get all courses data
    app.get("/allCourses", verifyJWT, async (req, res) => {
      const result = await coursesCollection.find().toArray();
      res.send(result);
    });

    app.patch("/allCourses/approved/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approve",
        },
      };

      const result = await coursesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // ===================enroll related route=============
    app.get("/enrolled", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (email) {
        const classes = await enrollClassCollection
          .find({ email: email })
          .toArray();
        res.send(classes);
      } else {
        const classes = await enrollClassCollection.find().toArray();
        res.send(classes);
      }
    });

    app.put("/enrolled/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const classes = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };

      const updateDoc = {
        $set: classes,
      };

      const enrolled = await enrollClassCollection.updateOne(
        query,
        updateDoc,
        options
      );

      res.send(enrolled);
    });

    app.delete("/enrolled/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const deletedDoc = await enrollClassCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send(deletedDoc);
    });

    // reviews
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    });

    // Instructor Work
    app.post("/instructorClasses", async (req, res) => {
      const item = req.body;
      const result = await coursesCollection.insertOne(item);
      // use classCollection
      res.send(result);
    });

    // payment work api==============================================

    //payment
    app.get("/payment/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const paymentDetail = await paymentCollection
        .find({ email: email })
        .toArray();

      res.send(paymentDetail);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", verifyJWT, async (req, res) => {
      const paymentDetail = req.body;
      const userId = paymentDetail.userId;
      const classId = paymentDetail.classId;

      const updateQuery = { _id: new ObjectId(classId) };

      const updateDoc = {
        $inc: {
          availableSeats: -1,
          enrolled: 1,
        },
      };

      const insertedResult = await paymentCollection.insertOne(paymentDetail);

      const updateResult = await coursesCollection.updateOne(
        updateQuery,
        updateDoc
      );

      const deleteResult = await enrollClassCollection.deleteOne({
        _id: new ObjectId(userId),
      });

      res.send({ insertedResult, updateResult, deleteResult });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Summer-Camp is running...");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
