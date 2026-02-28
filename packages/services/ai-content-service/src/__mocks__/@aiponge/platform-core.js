/* global jest */

module.exports = {
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  ServiceResponse: {
    success: (data) => ({ success: true, data }),
    error: (message) => ({ success: false, error: message }),
  },
};
