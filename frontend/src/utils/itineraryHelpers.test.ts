import { buildGoogleMapsUrl, ItineraryItem } from './itineraryHelpers';

describe('buildGoogleMapsUrl', () => {
  it('returns empty string for empty items array or null/undefined', () => {
    expect(buildGoogleMapsUrl([])).toBe('');
    expect(buildGoogleMapsUrl(null as unknown as ItineraryItem[])).toBe('');
  });

  it('returns Google Maps search URL for 1 item with lat/lon', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Taipei 101', lat: 25.0339, lon: 121.5645 }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=25.0339%2C121.5645');
  });

  it('returns Google Maps search URL for 1 item with address fallback when lat/lon missing', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Taipei Station', address: 'No. 3, Beiping W Rd, Taipei City' }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('No. 3, Beiping W Rd, Taipei City')}`);
  });

  it('returns Google Maps search URL for 1 item with custom_name fallback when lat/lon and address missing', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Mysterious Spot' }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url).toBe(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Mysterious Spot')}`);
  });

  it('returns Google Maps dir URL for 2 items without waypoints', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Taipei 101', lat: 25.0339, lon: 121.5645 },
      { custom_name: 'Raohe Night Market', lat: 25.0509, lon: 121.5775 }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&origin=25.0339%2C121.5645&destination=25.0509%2C121.5775'
    );
  });

  it('returns Google Maps dir URL for 3+ items with encoded pipe-joined waypoints', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Taipei 101', lat: 25.0339, lon: 121.5645 },
      { custom_name: 'Songshan Cultural Park', lat: 25.0438, lon: 121.5607 },
      { custom_name: 'Raohe Night Market', lat: 25.0509, lon: 121.5775 }
    ];
    const url = buildGoogleMapsUrl(items);
    expect(url.startsWith('https://www.google.com/maps/dir/?api=1')).toBe(true);
    expect(url.includes('origin=25.0339%2C121.5645')).toBe(true);
    expect(url.includes('destination=25.0509%2C121.5775')).toBe(true);
    expect(url.includes('waypoints=25.0438%2C121.5607')).toBe(true);
  });

  it('handles multiple intermediate waypoints correctly', () => {
    const items: ItineraryItem[] = [
      { custom_name: 'Start', lat: 25.0, lon: 121.0 },
      { custom_name: 'Stop 1', lat: 25.1, lon: 121.1 },
      { custom_name: 'Stop 2', address: 'Taipei Zoo' },
      { custom_name: 'End', lat: 25.3, lon: 121.3 }
    ];
    const url = buildGoogleMapsUrl(items);
    const expectedWaypoints = `${encodeURIComponent('25.1,121.1')}|${encodeURIComponent('Taipei Zoo')}`;
    expect(url).toBe(
      `https://www.google.com/maps/dir/?api=1&origin=25%2C121&destination=25.3%2C121.3&waypoints=${expectedWaypoints}`
    );
  });
});
