import 'dotenv/config';
import app from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[IT Triage Server] Listening on http://localhost:${PORT}`);
});
