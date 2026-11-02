// Entry file for hosts that start a script instead of running `npm start`,
// such as Hostinger Node.js Web Apps. Run `npm run build` first.
const http = require("node:http");
const next = require("next");

process.env.NODE_ENV ||= "production";

// PORT is passed through as-is because some hosts set it to a socket path.
const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer(handle).listen(port, () => {
    console.log(`Print Orders listening on ${port}`);
  });
});
