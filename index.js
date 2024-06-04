const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const surveyCollection = client.db('surveyDB').collection('survey')

    app.get('/mostVotedSurveys', async (req,res) =>{
      const cursor = surveyCollection.find().sort({ totalVotes: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.post('/surveys',async (req,res) =>{
      const newSurvey = req.body;
      if (!newSurvey.status) {
        newSurvey.status = 'publish';
    }

    // Set the creation timestamp
    newSurvey.creationTime = new Date().toISOString();
    const result = await surveyCollection.insertOne(newSurvey)
    res.send(result)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res) =>{
    res.send('Survey Shark server is running')
})

app.listen(port, () =>{
    console.log(`Survey Shark server is running on port: ${port}`);
})