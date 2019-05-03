// Create project
const util = require('util');
const fs = require('fs');
const TrainingApiClient = require("azure-cognitiveservices-customvision-training");
const PredictionApiClient = require("azure-cognitiveservices-customvision-prediction");

const setTimeoutPromise = util.promisify(setTimeout);

// Set up environment variables
const dotenv = require('dotenv');
dotenv.config();

const trainingKey = process.env.TRAINING_KEY;
const predictionKey = process.env.PREDICTION_KEY;
const predictionResourceId = process.env.PREDICTION_RESOURCE_ID;
const dataRoot = './photos';

const endpoint = "https://westus2.api.cognitive.microsoft.com";

const publishIterationName = "classifyModel";

const trainer = new TrainingApiClient(trainingKey, endpoint);

(async () => {
	console.log("Creating project...");
	const project = await trainer.createProject("Azure CV Demo")

  // Create, upload, and tag images
	const pizzaTag = await trainer.createTag(project.id, "Pizza");

	console.log("Adding images...");
	let fileUploadPromises = [];

  const pizzaDir = `${dataRoot}/pizza`;
  const pizzaFiles = fs.readdirSync(pizzaDir);
	pizzaFiles.forEach(file => {
		fileUploadPromises.push(trainer.createImagesFromData(project.id, fs.readFileSync(`${pizzaDir}/${file}`), { tagIds: [pizzaTag.id] }));
	});

	await Promise.all(fileUploadPromises);

  // Train classifier
	console.log("Training...");
	let trainingIteration = await trainer.trainProject(project.id);

	console.log("Training started...");
	while (trainingIteration.status == "Training") {
		console.log("Training status: " + trainingIteration.status);
		await setTimeoutPromise(1000, null);
		trainingIteration = await trainer.getIteration(project.id, trainingIteration.id)
	}
	console.log("Training status: " + trainingIteration.status);

	// Publish the iteration to endpoint
	await trainer.publishIteration(project.id, trainingIteration.id, publishIterationName, predictionResourceId);

	const predictor = new PredictionApiClient(predictionKey, endpoint);
	const testFile = fs.readFileSync(`${dataRoot}/test/maybe-pizza.jpeg`);

	const results = await predictor.classifyImage(project.id, publishIterationName, testFile);

  // Show results
	console.log("Results:");
	results.predictions.forEach(predictedResult => {
		console.log(`\t ${predictedResult.tagName}: ${(predictedResult.probability * 100.0).toFixed(2)}%`);
	});
})()
