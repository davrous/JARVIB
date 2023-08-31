/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Code used when the app is loaded in the Teams meeting
// We're using the Teams JS SDK to get the context of our app in Teams

const searchParams = new URL(window.location).searchParams;
const root = document.getElementById("content");
let color = "white";

// STARTUP LOGIC
async function start() {
    // Check for page to display
    let view = searchParams.get("view") || "stage";

    // Check if we are running on stage.
    if (searchParams.get("inTeams")) {
        // Initialize teams app
        await microsoftTeams.app.initialize();

        // Get our frameContext from context of our app in Teams
        const context = await microsoftTeams.app.getContext();
        if (context.page.frameContext == "meetingStage") {
            view = "stage";
        }
        const theme = context.app.theme;
        if (theme == "default") {
            color = "black";
        }
        microsoftTeams.app.registerOnThemeChangeHandler(function(theme) {
            color = theme === "default" ? "black" : "white";
        });
    }

    // Load the requested view
    switch (view) {
        case "content":
            renderSideBar(root);
            break;
        case "config":
            renderSettings(root);
            break;
        case "stage":
        default:
            try {
                renderStage(root);
            } catch (error) {
                renderError(root, error);
            }
            break;
    }
}

// STAGE VIEW
const stageTemplate = document.createElement("template");

stageTemplate["innerHTML"] = `
<canvas id="renderCanvas"></canvas>
`;

function renderStage(elem) {
    elem.appendChild(stageTemplate.content.cloneNode(true));

    var __EVAL = s => eval(`void (__EVAL = ${__EVAL.toString()}); ${s}`);

    function evaluate(expr) {
        try {
            const result = __EVAL(expr);
            console.log(expr, '===>', result)
        } catch(err) {
            console.log(expr, 'ERROR:', err.message)
        }
    }

    var socket = io();
    var scene;
    var camera;
    var light;

    const canvas = document.getElementById("renderCanvas"); // Get the canvas element
    var engine = new BABYLON.Engine(canvas, true); // Generate the BABYLON 3D engine
    const createScene = function () {
        // Creates a basic Babylon Scene object
        scene = new BABYLON.Scene(engine);

        // Create a default skybox with an environment.
        var hdrTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://playground.babylonjs.com/textures/environment.dds", scene);
        var currentSkybox = scene.createDefaultSkybox(hdrTexture, true);

        camera = new window.BABYLON.ArcRotateCamera(
                "camera",
                -Math.PI / 2,
                Math.PI / 2.5,
                15,
                new window.BABYLON.Vector3(0, 0, 0)
        );
        // Targets the camera to scene origin
        camera.setTarget(BABYLON.Vector3.Zero());
        // This attaches the camera to the canvas
        camera.attachControl(canvas, true);
        // Creates a light, aiming 0,1,0 - to the sky
        light = new BABYLON.HemisphericLight("light", 
            new BABYLON.Vector3(0, 1, 0), scene);
        // Dim the light a small amount - 0 to 1
        light.intensity = 0.8;
        socket.on('execute code', function(msg) {
            console.log(msg);
            evaluate(msg);
        });

        return scene;
    };

    var scene = createScene(); //Call the createScene function
    // Register a render loop to repeatedly render the scene
    engine.runRenderLoop(function () {
            scene.render();
    });
    // Watch for browser/canvas resize events
    window.addEventListener("resize", function () {
            engine.resize();
    });
}

// SIDEBAR VIEW
const sideBarTemplate = document.createElement("template");

function renderSideBar(elem) {
    sideBarTemplate["innerHTML"] = `
    <style>
        .wrapper { text-align: center; color: ${color} }
        .title { font-size: large; font-weight: bolder; }
        .text { font-size: medium; }
    </style>
    <div class="wrapper">
        <p class="title">Lets get started</p>
        <p class="text">Press the share to meeting button.</p>
        <button class="share"> Share to meeting </button>
    </div>
    `;
    elem.appendChild(sideBarTemplate.content.cloneNode(true));
    const shareButton = elem.querySelector(".share");

    // Set the value at our dataKey with a random number between 1 and 6.
    shareButton.onclick = shareToStage;
}

function shareToStage() {
    microsoftTeams.meeting.shareAppContentToStage((error, result) => {
        if (!error) {
            console.log("Started sharing, sharedToStage result");
        } else {
            console.warn("SharingToStageError", error);
        }
    }, window.location.origin + "?inTeams=1&view=stage");
}

// SETTINGS VIEW
const settingsTemplate = document.createElement("template");

function renderSettings(elem) {
    settingsTemplate["innerHTML"] = `
    <style>
        .wrapper { text-align: center; color: ${color} }
        .title { font-size: large; font-weight: bolder; }
        .text { font-size: medium; }
    </style>
    <div class="wrapper">
        <p class="title">Welcome to J.A.R.V.I.B.!</p>
        <p class="text">Press the save button to continue.</p>
    </div>
    `;
    elem.appendChild(settingsTemplate.content.cloneNode(true));

    // Save the configurable tab
    microsoftTeams.pages.config.registerOnSaveHandler((saveEvent) => {
        microsoftTeams.pages.config.setConfig({
            websiteUrl: window.location.origin,
            contentUrl: window.location.origin + "?inTeams=1&view=content",
            entityId: "J.A.R.V.I.B.",
            suggestedDisplayName: "J.A.R.V.I.B.",
        });
        saveEvent.notifySuccess();
    });

    // Enable the Save button in config dialog
    microsoftTeams.pages.config.setValidityState(true);
}

// Error view
const errorTemplate = document.createElement("template");

errorTemplate["inner" + "HTML"] = `
  <style>
    .wrapper { text-align: center; color: red }
    .error-title { font-size: large; font-weight: bolder; }
    .error-text { font-size: medium; }
  </style>
  <div class="wrapper">
    <p class="error-title">Something went wrong</p>
    <p class="error-text"></p>
    <button class="refresh"> Try again </button>
  </div>
`;

function renderError(elem, error) {
    elem.appendChild(errorTemplate.content.cloneNode(true));
    const refreshButton = elem.querySelector(".refresh");
    const errorText = elem.querySelector(".error-text");

    // Refresh the page on click
    refreshButton.onclick = () => {
        window.location.reload();
    };
    console.error(error);
    const errorTextContent = error.toString();
    errorText.textContent = errorTextContent;
}

start().catch((error) => console.error(error));