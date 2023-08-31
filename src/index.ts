/* eslint-disable security/detect-object-injection */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
 
// Import required packages
import { config } from 'dotenv';
import * as path from 'path';
import * as restify from 'restify'; 

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationServiceClientCredentialFactory,
    MemoryStorage,
    TurnContext
} from 'botbuilder';

// Read botFilePath and botFileSecret from .env file.
const ENV_FILE = path.join(__dirname, '..', '.env');
config({ path: ENV_FILE });

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
    {},
    new ConfigurationServiceClientCredentialFactory({
        MicrosoftAppId: process.env.BOT_ID,
        MicrosoftAppPassword: process.env.BOT_PASSWORD,
        MicrosoftAppType: 'MultiTenant'
    })
);

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about how bots work.
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Create storage to use
//const storage = new MemoryStorage();

// Catch-all for errors.
const onTurnErrorHandler = async (context: TurnContext, error: Error) => {
    // This check writes out errors to console log .vs. app insights.
    // NOTE: In production environment, you should consider logging this to Azure
    //       application insights.
    console.error(`\n [onTurnError] unhandled error: ${error.toString()}`);

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
        'OnTurnError Trace',
        `${error.toString()}`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
    );

    // Send a message to the user
    await context.sendActivity('The bot encountered an error or bug.');
    await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};

// Set the onTurnError for the singleton CloudAdapter.
adapter.onTurnError = onTurnErrorHandler;

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening to ${server.url}`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo test your bot in Teams, sideload the app manifest.json within Teams Apps.');
});

import {
    Application,
    AzureOpenAIPlanner,
    DefaultTurnState,
    OpenAIPlanner,
    AI,
    DefaultConversationState,
    DefaultUserState,
    DefaultTempState,
    DefaultPromptManager
} from '@microsoft/teams-ai';
import * as responses from './responses';
import { forEach } from 'lodash';

interface fullListItem {
    name: string;
    imageUrl: string;
    modelUrl: string;
}

// Strongly type the applications turn state
interface ConversationState extends DefaultConversationState {
    greeted: boolean;
    fullList: fullListItem[];
    imageList: string[];
    list: string[];
    lastModelLoaded: string;
    fullCode: string;
}

type UserState = DefaultUserState;

interface TempState extends DefaultTempState {
    fullList: fullListItem[];
    imageList: string[];
    list: string[];
}

type ApplicationTurnState = DefaultTurnState<ConversationState, UserState, TempState>;

if (!process.env.OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY) {
    throw new Error('Missing OpenAIKey or Azure OpenAIKey environment variable');
}

let planner;

// Create AI components using Azure OpenAI if the environment variables are set
if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_API_ENDPOINT && process.env.AZURE_OPENAI_API_MODEL) {
    // Create AI components using Azure OpenAI
    planner = new AzureOpenAIPlanner<ApplicationTurnState>({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    defaultModel: process.env.AZURE_OPENAI_API_MODEL,
    endpoint: process.env.AZURE_OPENAI_API_ENDPOINT,
    logRequests: true
    });
    console.log("Using Azure OpenAI");
}
else {
    // Create AI components using OpenAI
    planner = new OpenAIPlanner<ApplicationTurnState>({
        apiKey: process.env.OPENAI_API_KEY!,
        defaultModel: 'gpt-3.5-turbo',
        logRequests: true
    });
    console.log("Using OpenAI");
}

const promptManager = new DefaultPromptManager<ApplicationTurnState>(path.join(__dirname, '../src/prompts'));

// Define storage and application
const storage = new MemoryStorage();
const app = new Application<ApplicationTurnState>({
    storage,
    ai: {
        planner,
        promptManager,
        prompt: 'chatGPT' 
    }
});

// Define an interface to strongly type data parameters for actions
interface GetModel {
    nameOfTheModel: string; // <- populated by GPT
}

// Define an interface to strongly type data parameters for actions
interface GetCode {
    code: string; // <- populated by GPT
}

// Listen for new members to join the conversation
app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
    if (!state.conversation.value.greeted) {
        state.conversation.value.greeted = true;
        await context.sendActivity(responses.greeting());
    }
});

// List for /reset command, then delete the conversation state, clean the object
// and reload the page containing the 3D canvas to start from scratch
app.message('/reset', async (context: TurnContext, state: ApplicationTurnState) => {
    state.conversation.delete();
    state.conversation.value.list = [];
    state.conversation.value.fullList = [];
    state.conversation.value.imageList = [];
    state.conversation.value.lastModelLoaded = "";
    state.conversation.value.fullCode = "";
    io.emit('execute code', "location.reload(true);");
    await context.sendActivity(responses.reset()); 
});

// List for /describe command to visually describe the complete scene to someone who is blind
app.message('/describe', async (context: TurnContext, state: ApplicationTurnState) => {
    await app.ai.chain(context, state, 'describe'); 
});

// List for /fullcode to return all the code generated so far by the bot if you want to copy it
app.message('/fullcode', async (context: TurnContext, state: ApplicationTurnState) => {
    await context.sendActivity(state.conversation.value.fullCode); 
});

// Register action handlers
app.ai.action('codeToExecute', async (context: TurnContext, state: ApplicationTurnState, codeToExecute: GetCode) => {
    let code = "";
    if (codeToExecute && codeToExecute.code) { 
        code = codeToExecute.code;
        io.emit('execute code', code);
        state.conversation.value.fullCode += code + "\n";
    };
    console.dir(codeToExecute.code);
    await context.sendActivity(codeToExecute.code); 

    return true;
}); 

app.ai.action('listAvailableModel', async (context: TurnContext, state: ApplicationTurnState, model: GetModel) => {
    console.dir(model);
    var modelName = model.nameOfTheModel ?? (<any>model).model; 
    var jsonRequest = 
            {
            "type":"Search",
            "pageSize":5,
            "query":modelName,
            "parameters":{"firstpartycontent":false,"app":"office"},
            "descriptor":{"$type":"FirstPartyContentSearchDescriptor"}
            }
    // create a POST request to the server with a JSON parameter 
    // that contains the model name
    const response = await fetch('https://hubble.officeapps.live.com/mediasvc/api/media/search?v=1&lang=en-us', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }, 
        body: JSON.stringify(jsonRequest)
    }); 
    const content = await response.json(); 

    if (content.Result && content.Result.PartGroups.length > 0) {
        state.conversation.value.list = [];
        state.conversation.value.fullList = [];
        state.conversation.value.imageList = [];
        var list = state.conversation.value.list;
        var fullList = state.conversation.value.fullList;
        var imageList = state.conversation.value.imageList;

        var results = content.Result.PartGroups;
        forEach(results, function(value) {
            var image = value.ImageParts[0].SourceUrl;
            var title;
            var url;
            forEach(value.TextParts, function(text) {
                if (text.TextCategory == "Title") {
                    title = text.Text;
                }
                if (text.TextCategory == "OasisGlbLink") {
                    url = text.Text;
                }
            });
            if (title && url && image) {  
                imageList.push(image);  
                list.push(title);
                fullList.push({name: title, imageUrl: image, modelUrl: url});
            }
        });

        state.temp.value.list = list; 
        state.temp.value.imageList = imageList;
        await app.ai.chain(context, state, 'listmodels'); 
    }

    return true;
});

app.ai.action('loadThisModel', async (context: TurnContext, state: ApplicationTurnState, model: GetModel) => {
    const modelsList = state.conversation.value.list;
    var modelName = model.nameOfTheModel ?? (<any>model).model; 
    let index: number;
    // If the user would like to load a specific model via its index in the list
    if (!isNaN(Number.parseInt(modelName))) {
        index = Number.parseInt(modelName);
    }
    // Otherwise, we look for the model name in the list        
    else {  
        index = modelsList.indexOf(modelName); 
    }
    // If the model is found, we load it
    if (index >= 0) {
        var modelToLoad = state.conversation.value.fullList[index];
        var fullUrl = modelToLoad.modelUrl;
        let lastSlash = fullUrl.lastIndexOf("/");
        let baseUrl = fullUrl.substring(0, lastSlash+1);
        let fileName = fullUrl.substring(lastSlash+1, fullUrl.length);
        var code = `BABYLON.SceneLoader.ImportMesh("", "${baseUrl}", "${fileName}", scene, function (newMeshes) {
            newMeshes[0].name = "${modelsList[index]}";
            newMeshes[0].scaling = new BABYLON.Vector3(30, 30, 30);
        });`;
        await context.sendActivity(responses.itemFound(modelsList[index], code));
        io.emit('execute code', code);
        state.conversation.value.fullCode += code + "\n";
        state.conversation.value.lastModelLoaded = modelsList[index];
        return true;
    } else {
        await context.sendActivity(responses.itemNotFound(modelName));
        return false;
    }
});

// Register a handler to handle unknown actions that might be predicted
app.ai.action(
    AI.UnknownActionName,
    async (context: TurnContext, state: ApplicationTurnState, data: GetCode, action?: string) => {
        await context.sendActivity(responses.unknownAction(action!));
        return false; 
    }
);

// Listen for incoming server requests.
server.post('/api/messages', async (req, res) => {
    // Route received a request to adapter for processing
    await adapter.process(req, res as any, async (context) => {
        // Dispatch to application for routing
        await app.run(context);  
    });
}); 

// WebSocket server part
const express = require('express'); 
const appSocket = express();
const http = require('http');
const serverSocket = http.createServer(appSocket);
const { Server } = require("socket.io");
const io = new Server(serverSocket);

appSocket.get('/', (req: any, res: any) => {
  res.sendFile(__dirname + '/index.html');
});

appSocket.get('/debug.html', (req: any, res: any) => {
    res.sendFile(__dirname + '/debug.html');
  });

appSocket.get('/app.js', (req: any, res: any) => {
    res.sendFile(__dirname + '/app.js');
  });

io.on('connection', (socket: any) => {
  console.log('a user connected');
});

serverSocket.listen(3000, () => {
  console.log('WebSocket server listening on *:3000');
});







