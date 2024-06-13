const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
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
    await client.connect();

    const userCollection = client.db('surveyDB').collection('users');
    const surveyCollection = client.db('surveyDB').collection('survey');

    // Authentication routes
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })
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

    // surveyor update servey
    app.put('/surveyor/update/:id', async(req,res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const options = { upsert: true };
      const updatedSurvey = req.body;
      const survey ={
        $set:{
            title: updatedSurvey.title,
            description: updatedSurvey.description,
            options: updatedSurvey.options,
            deadline: updatedSurvey.deadline,
            category: updatedSurvey.category
        }
      }
      const result = await surveyCollection.updateOne(filter, survey, options);
      res.send(result);
    })

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

    app.get('/surveys', async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });

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

    app.put('/api/users/:id', async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      // Update user role logic here
      // Example: Update user in database

      res.json({ success: true, message: 'User role updated' });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. You successfully connected to MongoDB!');
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
