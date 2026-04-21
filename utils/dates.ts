export function generateDateOptions(days: number = 14) {
  const options: string[] = [];
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    
    const value = d.toISOString().split('T')[0];
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    let label = `${value} (${weekday})`;
    
    if (i === 0) label = `Today - ${label}`;
    if (i === 1) label = `Tomorrow - ${label}`;
    
    options.push(label);
  }
  
  return options;
}

export function extractDateValue(selection: string) {
  // If the user selects "Today - 2026-04-18 (Sat)" we want "2026-04-18"
  // If they enter a custom value "2026-12-01", we want that.
  const match = selection.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : selection;
}
