const destinations = ['home', 'chat', 'image', 'transcribe', 'email', 'live', 'knowledge', 'agnes', 'agnes-learning', 'translator', 'documentjob', 'team', 'learning', 'canvassing', 'impacted', 'territories', 'stormmap', 'leaderboard', 'contests', 'myprofile', 'inspections', 'notifications', 'calendar', 'deaf-mode'] as const;

export function panelFromSearch(search: string): typeof destinations[number] {
  const params = new URLSearchParams(search);
  const panel = params.get('panel') || params.get('tab') || (params.get('persona') === 'susan' ? 'chat' : 'home');
  return destinations.find(destination => destination === panel) || 'home';
}
