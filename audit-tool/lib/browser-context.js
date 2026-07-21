function getDefaultContext(browser) {
  const context = browser?.contexts?.()[0];
  if (!context) {
    throw new Error("No browser context available. Open Chrome with remote debugging and try again.");
  }
  return context;
}

module.exports = { getDefaultContext };
