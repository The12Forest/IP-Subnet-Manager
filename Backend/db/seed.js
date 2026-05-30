// This file is for seeding the database with initial data if necessary.
// The project requirements state that the app should start with no pre-loaded subnet or host data.
// The first admin user is created via the setup wizard.

const seedDatabase = () => {
  console.log('Database seeding is not required for initial setup.');
  return Promise.resolve();
};

module.exports = seedDatabase;
