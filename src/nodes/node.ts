import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import http from "http";

export async function node(
    nodeId: number,
    N: number,
    F: number,
    initialValue: Value,
    isFaulty: boolean,
    nodesAreReady: () => boolean,
    setNodeIsReady: (index: number) => void
) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  const messages: Value[] = [];

  let killed = isFaulty;
  let x: 0 | 1 | "?" | null = isFaulty ? null : initialValue;
  let decided: boolean | null = isFaulty ? null : false;
  let k: number | null = isFaulty ? null : 0;

  app.get("/status", (req, res) => {
    if (killed) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  app.post("/message", (req, res) => {
    const { message } = req.body;
    messages.push(message);

    if (k === null && !killed) {
      if (Math.random() < 0.5) {
        const targetNodeId = Math.floor(Math.random() * N);
        if (x !== null) {
          sendMessage(targetNodeId, x);
        }
      }

      if (messages.length >= N - F) {
        const onesCount = messages.filter((msg) => msg === 1).length;
        const zerosCount = messages.length - onesCount;
        x = onesCount > zerosCount ? 1 : 0;
        decided = true;
      }
    }

    res.send("Message received");
  });

  app.get("/start", async (req, res) => {
    if (k === null || killed) {
      res.status(500).send("Cannot start algorithm on a faulty or stopped node");
      return;
    }
    if (decided === null) {
      decided = false;
      k = 0;
      for (let i = 0; i < F; i++) {
        const targetNodeId = Math.floor(Math.random() * N);
        if (targetNodeId !== nodeId) {
          if (x != null) {
            sendMessage(targetNodeId, x);
          }
        }
      }
      k++;

      res.send("Consensus algorithm started");
    } else {
      res.status(400).send("Algorithm already started");
    }
  });

  app.get("/stop", async (req, res) => {
    if (k === null || killed) {
      res.status(500).send("Cannot stop algorithm on a faulty or stopped node");
      return;
    }

    if (decided === null) {
      k = null;

      res.send("Consensus algorithm stopped");
    } else {
      res.status(400).send("Algorithm already stopped");
    }
  });

  app.get("/getState", (req, res) => {
    res.json({ killed, x, decided, k });
  });

  const sendMessage = (targetNodeId: number, message: Value) => {
    const targetPort = BASE_NODE_PORT + targetNodeId;

    const postData = JSON.stringify({ message });

    const options = {
      hostname: "localhost",
      port: targetPort,
      path: "/message",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      // Handle response if needed
    });

    req.on("error", (error) => {
      console.error(`Error sending message to node ${targetNodeId}: ${error.message}`);
    });

    req.write(postData);
    req.end();
  };

  // Start the server
  const server = app.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
        `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // The node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
