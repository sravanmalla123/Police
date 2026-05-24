import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

import { getAdminReports, createReport } from '../server/src/services/reportService.js';
import { db } from '../server/src/config/db.js';

async function run() {
  console.log('--- START TRANSLATION TEST ---');
  try {
    // 1. Check if we have an admin or staff user to associate the test report with.
    // If not, we will get or create a dummy user ID = 999.
    const user = await db.get('SELECT id FROM users LIMIT 1');
    const userId = user ? user.id : 1;

    // 2. Insert a report with a multi-sentence Telugu description
    const description = "హలో వరల్డ్. ఎలా ఉన్నారు? ఈరోజు పోలీస్ స్టేషన్ వద్ద ఒక సంఘటన జరిగింది. దయచేసి సహాయం చేయండి.";
    console.log(`Original Description (Telugu):\n"${description}"\n`);

    const report = await createReport({
      userId,
      area: 'Test Area',
      station: 'Test Station',
      officerName: 'Test Officer',
      priority: 'High',
      description,
      latitude: 16.5,
      longitude: 80.6
    });

    console.log(`Report created in SQLite database with ID: ${report.id}`);

    // 3. Retrieve reports asking for English translation ('en')
    const reports = await getAdminReports({ lang: 'en' });
    const targetReport = reports.find(r => r.id === report.id);

    if (!targetReport) {
      throw new Error('Test report was not returned by getAdminReports!');
    }

    console.log(`\nTranslated Description (English):\n"${targetReport.translated_description}"\n`);

    // Verify it translated multiple sentences (checking if it contains translation from all parts)
    const containsHello = /hello/i.test(targetReport.translated_description);
    const containsHowAreYou = /how are you/i.test(targetReport.translated_description) || /how you/i.test(targetReport.translated_description);
    const containsStation = /station/i.test(targetReport.translated_description);

    console.log('Validation checks:');
    console.log(`- Contains "Hello/world": ${containsHello}`);
    console.log(`- Contains "How are you": ${containsHowAreYou}`);
    console.log(`- Contains "station/police": ${containsStation}`);

    if (containsHello && containsHowAreYou && containsStation) {
      console.log('\n✅ SUCCESS: Multi-sentence auto-translation verified successfully!');
    } else {
      console.error('\n❌ FAILURE: Multi-sentence translation might be truncated or incomplete.');
    }

    // Clean up test report
    await db.run('DELETE FROM reports WHERE id = ?', [report.id]);
    console.log('Test report cleaned up.');

  } catch (err) {
    console.error('Error during translation test:', err);
  }
  process.exit(0);
}

run();
