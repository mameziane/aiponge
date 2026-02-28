/* global jest */

module.exports = {
  ServiceRegistry: {
    getInstance: jest.fn(() => ({
      register: jest.fn(),
      unregister: jest.fn(),
      getService: jest.fn(),
    })),
  },
  hasService: jest.fn().mockReturnValue(true),
  getServiceUrl: jest.fn().mockReturnValue('http://localhost:3000'),
  waitForService: jest.fn().mockResolvedValue(true),
  listServices: jest.fn().mockReturnValue([]),
};
