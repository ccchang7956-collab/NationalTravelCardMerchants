import React from 'react';
import { render, screen, act } from '@testing-library/react';
import PWAOfflineBanner from '../components/PWAOfflineBanner';

describe('PWAOfflineBanner', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    });
  });

  it('renders nothing when online initially', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    const { container } = render(<PWAOfflineBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('目前為離線模式（讀取快取地圖與店家資料）')).not.toBeInTheDocument();
  });

  it('renders offline banner when offline initially', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    render(<PWAOfflineBanner />);
    expect(screen.getByText('目前為離線模式（讀取快取地圖與店家資料）')).toBeInTheDocument();
  });

  it('displays banner when offline event is fired', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    render(<PWAOfflineBanner />);
    expect(screen.queryByText('目前為離線模式（讀取快取地圖與店家資料）')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText('目前為離線模式（讀取快取地圖與店家資料）')).toBeInTheDocument();
  });

  it('disappears banner when online event is fired', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    render(<PWAOfflineBanner />);
    expect(screen.getByText('目前為離線模式（讀取快取地圖與店家資料）')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText('目前為離線模式（讀取快取地圖與店家資料）')).not.toBeInTheDocument();
  });
});
