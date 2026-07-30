import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchInput } from './SearchInput';

describe('SearchInput', () => {
  it('renders an open search button', () => {
    render(<SearchInput />);
    const trigger = screen.getByRole('button', { name: /open search/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Search Site...');
  });
});
