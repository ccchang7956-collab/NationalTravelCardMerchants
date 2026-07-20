import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MobileBottomSheet from '../components/MobileBottomSheet';

describe('MobileBottomSheet component', () => {
  it('renders drag handle and children content', () => {
    const handleSnapChange = jest.fn();
    render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={handleSnapChange}>
        <div>Test Content</div>
      </MobileBottomSheet>
    );

    expect(screen.getByTestId('drag-handle')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders correct initial height class/style for given snapState', () => {
    const { rerender } = render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={jest.fn()}>
        <div>Content</div>
      </MobileBottomSheet>
    );

    const sheet = screen.getByTestId('bottom-sheet');
    expect(sheet).toHaveStyle({ height: '80px' });

    rerender(
      <MobileBottomSheet snapState="half" onSnapChange={jest.fn()}>
        <div>Content</div>
      </MobileBottomSheet>
    );
    expect(sheet).toHaveStyle({ height: '45vh' });

    rerender(
      <MobileBottomSheet snapState="full" onSnapChange={jest.fn()}>
        <div>Content</div>
      </MobileBottomSheet>
    );
    expect(sheet).toHaveStyle({ height: '90vh' });
  });

  it('includes Tailwind CSS styling supporting dark mode', () => {
    render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={jest.fn()}>
        <div>Content</div>
      </MobileBottomSheet>
    );

    const sheet = screen.getByTestId('bottom-sheet');
    expect(sheet).toHaveClass('bg-white', 'dark:bg-slate-900', 'border-t', 'border-slate-200', 'dark:border-slate-800');
  });

  it('clicking drag handle calls onSnapChange with next cycled state', () => {
    const handleSnapChange = jest.fn();
    const { rerender } = render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={handleSnapChange}>
        <div>Content</div>
      </MobileBottomSheet>
    );

    const dragHandle = screen.getByTestId('drag-handle');

    fireEvent.click(dragHandle);
    expect(handleSnapChange).toHaveBeenCalledWith('half');

    handleSnapChange.mockClear();
    rerender(
      <MobileBottomSheet snapState="half" onSnapChange={handleSnapChange}>
        <div>Content</div>
      </MobileBottomSheet>
    );
    fireEvent.click(dragHandle);
    expect(handleSnapChange).toHaveBeenCalledWith('full');

    handleSnapChange.mockClear();
    rerender(
      <MobileBottomSheet snapState="full" onSnapChange={handleSnapChange}>
        <div>Content</div>
      </MobileBottomSheet>
    );
    fireEvent.click(dragHandle);
    expect(handleSnapChange).toHaveBeenCalledWith('collapsed');
  });

  it('handles keyboard navigation on drag handle', () => {
    const handleSnapChange = jest.fn();
    render(
      <MobileBottomSheet snapState="collapsed" onSnapChange={handleSnapChange}>
        <div>Content</div>
      </MobileBottomSheet>
    );

    const dragHandle = screen.getByTestId('drag-handle');
    fireEvent.keyDown(dragHandle, { key: 'Enter' });
    expect(handleSnapChange).toHaveBeenCalledWith('half');

    handleSnapChange.mockClear();
    fireEvent.keyDown(dragHandle, { key: ' ' });
    expect(handleSnapChange).toHaveBeenCalledWith('half');
  });
});
