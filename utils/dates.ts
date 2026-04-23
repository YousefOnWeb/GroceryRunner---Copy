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
  const match = selection.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : selection;
}

export function getDefaultDate() {
  const now = new Date();
  const hour = now.getHours();
  const target = new Date(now);
  // Default to tomorrow if current time is between 4pm (16:00) and 11:59pm
  if (hour >= 16) {
    target.setDate(now.getDate() + 1);
  }
  return target;
}

export function formatDateLabel(date: Date) {
  const value = date.toISOString().split('T')[0];
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  let label = `${value} (${weekday})`;
  if (value === todayStr) label = `Today - ${label}`;
  else if (value === tomorrowStr) label = `Tomorrow - ${label}`;
  
  return label;
}
