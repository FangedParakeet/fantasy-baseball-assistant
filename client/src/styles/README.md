# CSS Styles Documentation

This directory contains the organized CSS styles for the Fantasy Baseball Assistant application.

## File Structure

- `index.css` - Main entry point that imports all stylesheets
- `common.css` - Shared styles for buttons, containers, and common elements
- `forms.css` - Form-specific styles and layouts
- `components.css` - Component-specific styles

## Usage

Import the main stylesheet in your component:

```javascript
import '../styles/index.css';
```

Or import individual stylesheets as needed:

```javascript
import '../styles/common.css';
import '../styles/forms.css';
```

## Available Classes

### Layout & Containers

- `.container` - Standard container (max-width: 800px)
- `.container-wide` - Wide container (max-width: 1000px)
- `.section` - Section with light background
- `.section-white` - Section with white background and border

### Buttons

- `.btn` - Base button styles
- `.btn-primary` - Primary button (blue)
- `.btn-success` - Success button (green)
- `.btn-warning` - Warning button (yellow)
- `.btn-secondary` - Secondary button (gray)
- `.btn-large` - Large button with increased padding
- `.btn-full` - Full-width button

### Forms

- `.form-container` - Form layout container
- `.form-container-wide` - Wide form layout for multiple columns
- `.form-group` - Form field group
- `.form-input` - Base input styles
- `.form-input-date` - Date input specific styles
- `.form-input-select` - Select input specific styles
- `.form-textarea` - Textarea styles
- `.form-actions` - Form action buttons container
- `.form-error` - Form validation error styling

### Components

- `.player-card` - Player information card
- `.player-card-header` - Player card header layout
- `.player-info` - Player information container
- `.player-headshot` - Player headshot image
- `.analysis-section` - AI analysis display section
- `.analysis-content` - AI analysis content formatting
- `.roster-summary` - Roster summary section
- `.players-grid` - Grid layout for player cards
- `.empty-state` - Empty state message styling
- `.quick-actions` - Quick action buttons list
- `.context-display` - AI context display area
- `.context-edit-form` - Context editing form

### Utilities

- `.text-center` - Center text alignment
- `.mb-0`, `.mb-10`, `.mb-15`, `.mb-20` - Margin bottom utilities
- `.mt-20`, `.mt-30` - Margin top utilities
- `.p-0`, `.p-20`, `.p-40`, `.p-50` - Padding utilities

### States

- `.loading-container` - Loading state container
- `.loading-text` - Loading text styling
- `.error-container` - Error state container
- `.alert` - Alert base styles
- `.alert-success` - Success alert
- `.alert-error` - Error alert
- `.alert-warning` - Warning alert

### Spinners

- `.spinner` - Loading spinner
- `.spinner-small` - Small loading spinner

## Responsive Design

The styles include responsive breakpoints for mobile devices:

```css
@media (max-width: 768px) {
  /* Mobile-specific styles */
}
```

## Best Practices

1. Use semantic class names that describe the purpose
2. Combine utility classes for spacing and layout
3. Use component classes for specific UI elements
4. Avoid inline styles - use the provided CSS classes
5. Follow the established naming conventions

## Adding New Styles

When adding new styles:

1. Determine if it's a common pattern (add to `common.css`)
2. If it's form-related (add to `forms.css`)
3. If it's component-specific (add to `components.css`)
4. Update this README with new class documentation 