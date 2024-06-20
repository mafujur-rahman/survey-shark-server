const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors({
  origin: ["http://localhost:5173", "https://survey-shark-ccd5f.web.app", "https://survey-shark-ccd5f.firebaseapp.com"]
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zjwopdy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db('surveyDB').collection('users');
    const surveyCollection = client.db('surveyDB').collection('survey');
    const surveyResponses = client.db('surveyDB').collection('responses');
    const surveyFeedbacks = client.db('surveyDB').collection('feedbacks');
    const paymentCollection = client.db('surveyDB').collection('payments');
    const reportCollection = client.db('surveyDB').collection('reports');
    const commentCollection = client.db('surveyDB').collection('comments');

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      console.log('Received user for JWT:', user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      console.log('Generated token:', token);
      res.send({ token });
    });

    // midleware
    const verifyToken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })

    }


    // Authentication routes
    app.get('/users', verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // isAdmin api
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });

    // isSurveyor api
    app.get('/users/surveyor/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let surveyor = false;
      if (user) {
        surveyor = user?.role === 'surveyor';
      }
      res.send({ surveyor });
    });

    // is pro-user api
    app.get('/users/pro-user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let proUser = false;
      if (user) {
        proUser = user?.role === 'pro-user';
      }
      res.send({ proUser });
    });

    app.get('/users', async (req, res) => {
      try {
        const { role } = req.query;
        const filter = role ? { role } : {};
        const result = await userCollection.find(filter).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exist' })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);

    });

    // manage users
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result)
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      try {
        const user = await userCollection.findOne(filter);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        let newRole;
        if (user.role === 'user') {
          newRole = 'surveyor';
        } else if (user.role === 'surveyor') {
          newRole = 'admin';
        } else {
          return res.status(400).json({ error: 'Role cannot be updated' });
        }

        const updatedDoc = {
          $set: {
            role: newRole
          }
        };

        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // manage surveys
    app.patch('/surveys/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      try {
        // Fetch the current survey
        const survey = await surveyCollection.findOne(filter);
        if (!survey) {
          return res.status(404).json({ error: 'Survey not found' });
        }

        // Determine the new status
        let newStatus;
        if (survey.status === 'publish') {
          newStatus = 'unpublish';
        } else if (survey.status === 'unpublish') {
          newStatus = 'publish';
        } else {
          return res.status(400).json({ error: 'Status cannot be updated' });
        }

        // Update the survey with the new status
        const updatedDoc = {
          $set: {
            status: newStatus
          }
        };

        const result = await surveyCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // get feedbacks
    app.get('/surveyFeedbacks', async (req, res) => {
      const result = await surveyFeedbacks.find().toArray();
      res.send(result);
    });

    // post feedbacks
    app.post('/surveyFeedbacks', async (req, res) => {
      const newFeedback = req.body;
      const result = await surveyFeedbacks.insertOne(newFeedback);
      res.send(result);
    })

    // surveyor update servey
    app.put('/surveyor/update/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updatedSurvey = req.body;
      const survey = {
        $set: {
          title: updatedSurvey.title,
          description: updatedSurvey.description,
          options: updatedSurvey.options,
          deadline: updatedSurvey.deadline,
          category: updatedSurvey.category
        }
      }
      const result = await surveyCollection.updateOne(filter, survey, options);
      res.send(result);
    });

    // surveyor view surveys
    app.get('/responses', async (req, res) => {
      const surveys = await surveyResponses.find().toArray();
      res.send(surveys);
    });

    app.get('/responses/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await surveyResponses.findOne(query);
      res.send(result);
    });


    app.get('/surveys/latest', async (req, res) => {
      const cursor = surveyCollection.find().sort({ creationTime: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/surveys/most-voted', async (req, res) => {
      const cursor = surveyCollection.find().sort({ totalVotes: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });


    // Update vote
    app.patch('/surveys/vote/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };


      try {
        const result = await surveyCollection.updateOne(filter, {
          $inc: { totalVotes: 1 }
        });

        if (result.modifiedCount === 1) {
          res.status(200).send({ message: 'Vote counted successfully.' });
        } else {
          res.status(404).send({ message: 'Survey not found.' });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'An error occurred while counting the vote.' });
      }
    });

    // available surveys
    app.get('/available-surveys', async (req, res) => {
      try {
        const currentDate = new Date();
        const result = await surveyCollection.find({ deadline: { $gte: currentDate.toISOString().split('T')[0] } }).toArray();
        res.json(result);
      } catch (error) {
        console.error('Error fetching surveys:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });



    // report related api

    app.get('/reports', async (req, res) => {
      const result = await reportCollection.find().toArray();
      res.send(result);
    });

    app.post('/reports', async (req, res) => {
      const newReport = req.body;
      const result = await reportCollection.insertOne(newReport);
      res.send(result);
    });


    // suevey related api 
    app.get('/publish-surveys', async (req, res) => {
      try {
        const result = await surveyCollection.find({ status: 'publish' }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Failed to fetch surveys");
      }
    });

    app.get('/surveys', async(req,res) =>{
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });

    // survey responses
    app.post('/responses', async (req, res) => {
      const newResponse = req.body;
      const result = await surveyResponses.insertOne(newResponse);
      res.send(result);
    })

    app.post('/surveys', async (req, res) => {
      const newSurvey = req.body;
      if (!newSurvey.status) {
        newSurvey.status = 'publish';
      }
      // Set the creation timestamp
      newSurvey.creationTime = new Date().toISOString();
      const result = await surveyCollection.insertOne(newSurvey);
      res.send(result);
    });

    // comments api

    app.get('/comments', async (req, res) => {
      const result = await commentCollection.find().toArray();
      res.send(result);
    });

    app.post('/comments', async (req, res) => {
      const newComment = req.body;
      const result = await commentCollection.insertOne(newComment);
      res.send(result);
    });

    // payment get
    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    });


    // payment post 
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    // Payment intent creation endpoint
    app.post('/create-payment-intent', async (req, res) => {
      const { amount } = req.body;

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });


    app.patch('/users/:email', async (req, res) => {
      const newRole = req.body;
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const UserRole = {
        $set: {
          role: newRole.role,
        }
      }
      const result = await userCollection.updateOne({ email: email }, UserRole);
      res.send(result);
    });
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;

      const user = await userCollection.findOne({ email: email });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.send(user);
    });


    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    // console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Survey Shark server is running');
});

app.listen(port, () => {
  console.log(`Survey Shark server is running on port: ${port}`);
});
