import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let currentQuestion = null;
let answers = {};
const students = new Map();

function emitStudents() {
  io.emit("students", Array.from(students.values()));
}
function showResults() {
  if (!currentQuestion) return;
  io.emit("showResults", { question: currentQuestion, answers });
  if (currentQuestion.timeout) clearTimeout(currentQuestion.timeout);
  currentQuestion = null;
  answers = {};
}

io.on("connection", (socket) => {
  socket.on("join", (name) => {
    students.set(socket.id, { id: socket.id, name });
    emitStudents();
  });

  socket.on("askQuestion", (q) => {
    if (currentQuestion && Object.keys(answers).length !== students.size) {
      socket.emit("errorMessage", "Wait until all students answer.");
      return;
    }
    currentQuestion = { id: Date.now(), ...q };
    answers = {};
    io.emit("newQuestion", currentQuestion);

    const ms = (currentQuestion.timeLimit || 60) * 1000;
    currentQuestion.timeout = setTimeout(showResults, ms);
  });

  socket.on("submitAnswer", ({ answer }) => {
    const st = students.get(socket.id);
    answers[socket.id] = { name: st?.name || "Anonymous", answer };
    io.emit("answerUpdate", answers);
    if (Object.keys(answers).length === students.size) showResults();
  });

  socket.on("removeStudent", (sid) => {
    const s = io.sockets.sockets.get(sid);
    if (s) {
      s.emit("removedByTeacher");
      s.disconnect(true);
    }
    students.delete(sid);
    delete answers[sid];
    emitStudents();
    if (currentQuestion && Object.keys(answers).length === students.size)
      showResults();
  });

  socket.on("disconnect", () => {
    students.delete(socket.id);
    delete answers[socket.id];
    emitStudents();
    if (currentQuestion && Object.keys(answers).length === students.size)
      showResults();
  });
});

app.get("/", (_, res) => res.send("Backend is running"));

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Backend is running at http://localhost:${PORT}`);
});
