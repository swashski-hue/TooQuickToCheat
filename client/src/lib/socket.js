import { io } from "socket.io-client";
import { SERVER_URL } from "./api.js";

// Empty SERVER_URL means "same origin" — pass undefined so socket.io-client defaults
// to the current page's origin instead of trying to connect to "".
export const socket = io(SERVER_URL || undefined, { autoConnect: false, withCredentials: true });
