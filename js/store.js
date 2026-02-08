import { world } from './constants.js';

export const canvas = document.getElementById("c");
export const ctx = canvas.getContext("2d");

export const scoreEl = document.getElementById("score");
export const highScoreEl = document.getElementById("highScore");
export const lenEl = document.getElementById("len");
export const botsEl = document.getElementById("bots");
export const energyEl = document.getElementById("energy");
export const deadOverlay = document.getElementById("deadOverlay");
export const lbListEl = document.getElementById("lbList");

export const lbYouEl = document.getElementById("lbYou");
export const killFeedEl = document.getElementById("killFeed");
export const startOverlay = document.getElementById("startOverlay");
export const playerNameInput = document.getElementById("playerNameInput");
export const startButton = document.getElementById("startButton");
export const controlBtns = document.querySelectorAll(".btn-ctrl");
export const toggleControlBtn = document.getElementById("toggleControl");

export const state = {
    cam: { x: world.w / 2, y: world.h / 2, shakeX: 0, shakeY: 0 },
    camScale: 1.0,
    snakes: [],
    foods: [],
    particles: [],

    foodGrid: new Map(),
    player: null,
    mouse: { x: innerWidth * 0.5, y: innerHeight * 0.5 },
    boosting: false,
    gameStarted: false,
    playerName: "Anonim",
    socket: null,
    otherPlayers: new Map(),
    keys: { w: false, a: false, s: false, d: false, up: false, left: false, down: false, right: false },
    controlMode: "auto" // auto, mouse, keyboard
};
