import {
  CONFIG,
  QUERY_STALE_TIME,
  QUERY_GC_TIME,
  QUERY_REFETCH_INTERVAL,
  UI_DELAYS,
  ADMIN_QUERY,
} from '../../constants/appConfig';

describe('Runtime Configuration', () => {
  describe('CONFIG object', () => {
    it('should have query timing configuration', () => {
      expect(CONFIG.query).toBeDefined();
      expect(typeof CONFIG.query.staleTime).toBe('object');
      expect(typeof CONFIG.query.gcTime).toBe('object');
      expect(typeof CONFIG.query.refetchInterval).toBe('object');
    });

    it('should have UI delays configuration', () => {
      expect(CONFIG.ui).toBeDefined();
      expect(typeof CONFIG.ui.delays).toBe('object');
    });

    it('should have admin configuration', () => {
      expect(CONFIG.admin).toBeDefined();
      expect(typeof CONFIG.admin.query).toBe('object');
    });
  });

  describe('QUERY_STALE_TIME', () => {
    it('should have default stale time', () => {
      expect(QUERY_STALE_TIME.default).toBe(5 * 60 * 1000);
    });

    it('should have short stale time less than default', () => {
      expect(QUERY_STALE_TIME.short).toBeLessThan(QUERY_STALE_TIME.default);
    });

    it('should have long stale time equal to default', () => {
      expect(QUERY_STALE_TIME.long).toBe(QUERY_STALE_TIME.default);
    });
  });

  describe('QUERY_GC_TIME', () => {
    it('should have default gc time', () => {
      expect(QUERY_GC_TIME.default).toBe(5 * 60 * 1000);
    });

    it('should have short gc time less than default', () => {
      expect(QUERY_GC_TIME.short).toBeLessThan(QUERY_GC_TIME.default);
    });

    it('should have long gc time greater than default', () => {
      expect(QUERY_GC_TIME.long).toBeGreaterThan(QUERY_GC_TIME.default);
    });
  });

  describe('QUERY_REFETCH_INTERVAL', () => {
    it('should have frequent refetch interval', () => {
      expect(QUERY_REFETCH_INTERVAL.frequent).toBe(30 * 1000);
    });

    it('should have normal refetch interval', () => {
      expect(QUERY_REFETCH_INTERVAL.normal).toBe(60 * 1000);
    });

    it('should have background refetch interval', () => {
      expect(QUERY_REFETCH_INTERVAL.background).toBe(5 * 60 * 1000);
    });
  });

  describe('UI_DELAYS', () => {
    it('should have debounce delay', () => {
      expect(UI_DELAYS.debounceMs).toBe(150);
    });

    it('should have toast duration', () => {
      expect(UI_DELAYS.toastDurationMs).toBe(2000);
    });

    it('should have navigation delay', () => {
      expect(UI_DELAYS.navigationDelayMs).toBe(500);
    });
  });

  describe('ADMIN_QUERY', () => {
    it('should have stale time configuration', () => {
      expect(ADMIN_QUERY.staleTime).toBeDefined();
      expect(ADMIN_QUERY.staleTime.fast).toBe(5 * 1000);
      expect(ADMIN_QUERY.staleTime.normal).toBe(10 * 1000);
    });

    it('should have refetch interval configuration', () => {
      expect(ADMIN_QUERY.refetchInterval).toBeDefined();
      expect(ADMIN_QUERY.refetchInterval.realtime).toBe(15 * 1000);
      expect(ADMIN_QUERY.refetchInterval.fast).toBe(30 * 1000);
    });
  });
});
