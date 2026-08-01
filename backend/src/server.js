require('dotenv').config();

const app = require('./app');

const {
  connectDatabase,
  closeDatabase,
} = require('./config/database');

const port = Number(
  process.env.PORT || 3000
);

let server;

async function startServer() {
  try {
    await connectDatabase();

    server = app.listen(
      port,
      '0.0.0.0',
      () => {
        console.log(
          `Backend started on port ${port}`
        );

        console.log(
          `Health URL: http://localhost:${port}/api/health`
        );
      }
    );

    server.on('error', (error) => {
      console.error(
        'HTTP server error:',
        error
      );
    });
  } catch (error) {
    console.error(
      'Unable to start backend:',
      error
    );

    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(
    `${signal} received. Shutting down...`
  );

  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }

  await closeDatabase();

  process.exit(0);
}

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'uncaughtException',
  (error) => {
    console.error(
      'Uncaught exception:',
      error
    );

    process.exit(1);
  }
);

process.on(
  'unhandledRejection',
  (reason) => {
    console.error(
      'Unhandled rejection:',
      reason
    );

    process.exit(1);
  }
);

startServer();