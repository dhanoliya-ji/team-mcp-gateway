// main.jsx
// The start point of the React app. It puts <App /> into the page.
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";

createRoot(document.getElementById("root")).render(<App />);
