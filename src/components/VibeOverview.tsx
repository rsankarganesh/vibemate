import {useState, type ReactNode} from 'react';
import {CalendarPlus, Check, Clock3, ExternalLink, ImagePlus, Images, MapPin, Megaphone, Navigation, Pencil, Plus, Share2, Trash2, UsersRound} from 'lucide-react';
import type {StoredMembership} from '../lib/storage';
import type {AlbumProvider, RsvpStatus, Vibe} from '../types';
import {addLiveAlbum, removeLiveAlbum, setLiveRsvp, updateLiveOverview} from '../services/vibe-service';
import {Modal} from './Modal';

const providers: Array<{id: AlbumProvider; label: string; symbol: string; hint: string}> = [
  {id: 'google_photos', label: 'Google Photos shared album', symbol: '📸', hint: 'In Google Photos: open the album → Share → Create link → Copy.'},
  {id: 'apple_photos', label: 'Apple Shared Album / iCloud', symbol: '🍎', hint: 'In Photos: open the shared album → People → Public Website → copy the iCloud link.'},
  {id: 'onedrive', label: 'OneDrive folder', symbol: '☁️', hint: 'In OneDrive: select the folder → Share → Anyone with the link → Copy link.'},
  {id: 'dropbox', label: 'Dropbox folder', symbol: '📦', hint: 'In Dropbox: select the folder → Share → Copy link.'},
  {id: 'youtube', label: 'YouTube unlisted playlist', symbol: '▶️', hint: 'Set the playlist to Unlisted, then choose Share → Copy link.'},
  {id: 'google_drive', label: 'Google Drive folder', symbol: '🔺', hint: 'In Drive: Share the folder → General access → Anyone with the link → Copy link.'},
  {id: 'other', label: 'Other shared link', symbol: '🔗', hint: 'Use a secure https link that everyone in the vibe is allowed to open.'},
];

function detectProvider(value: string): AlbumProvider {
  const host = (() => {try {return new URL(value).hostname.toLowerCase();} catch {return '';}})();
  if (host.includes('photos.app.goo.gl') || host.includes('photos.google.com')) return 'google_photos';
  if (host.includes('icloud.com')) return 'apple_photos';
  if (host.includes('1drv.ms') || host.includes('onedrive.live.com')) return 'onedrive';
  if (host.includes('dropbox.com')) return 'dropbox';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('drive.google.com')) return 'google_drive';
  return 'other';
}

function countdown(startsAt: string) {
  if (!startsAt) return 'Date to be decided';
  const ms = new Date(startsAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 'Date to be decided';
  if (ms <= 0) return 'This vibe has started';
  const days = Math.floor(ms / 86_400_000);
  if (days > 1) return `Starts in ${days} days`;
  if (days === 1) return 'Starts tomorrow';
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  return `Starts in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function localInputValue(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function downloadCalendar(vibe: Vibe) {
  const start = vibe.startsAt ? new Date(vibe.startsAt) : new Date();
  const end = new Date(start.getTime() + 2 * 3_600_000);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (value: string) => value.replace(/[\\,;]/g, match => `\\${match}`).replace(/\n/g, '\\n');
  const body = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vibemates//Vibe//EN','BEGIN:VEVENT',`UID:${vibe.id}@vibemates`,`DTSTAMP:${stamp(new Date())}`,`DTSTART:${stamp(start)}`,`DTEND:${stamp(end)}`,`SUMMARY:${clean(`${vibe.name} ${vibe.emoji}`)}`,`LOCATION:${clean(vibe.location)}`,`DESCRIPTION:${clean(vibe.description || 'Shared with Vibemates')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([body], {type: 'text/calendar'}));
  link.download = `${vibe.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'vibe'}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function VibeOverview({vibe, membership, admin, navigation, onRefresh, notify}: {vibe: Vibe; membership: StoredMembership; admin?: boolean; navigation?: ReactNode; onRefresh: () => Promise<void>; notify: (message: string) => void}) {
  const [dialog, setDialog] = useState<'album'|'overview'|''>('');
  const rsvps = vibe.rsvps ?? [];
  const myRsvp = rsvps.find(item => item.memberId === 'alex')?.status;
  const counts = {going: rsvps.filter(item => item.status === 'going').length, maybe: rsvps.filter(item => item.status === 'maybe').length, cant_go: rsvps.filter(item => item.status === 'cant_go').length};
  const organiser = vibe.members.find(member => member.isAdmin)?.name ?? 'Vibe organiser';
  const share = async () => {
    if (!vibe.inviteToken) return notify('Ask the organiser for the invitation link.');
    const url = `${location.origin}${location.pathname}#/join/${vibe.inviteToken}`;
    try {
      if (navigator.share) await navigator.share({title: `${vibe.name} · Vibemates`, text: `Join ${vibe.name} on Vibemates`, url});
      else {await navigator.clipboard.writeText(url); notify('Invitation copied ✓');}
    } catch (caught) {if ((caught as DOMException).name !== 'AbortError') notify('Couldn’t share the invitation.');}
  };
  const setRsvp = async (status: RsvpStatus) => {try {await setLiveRsvp(membership,status);await onRefresh();notify('RSVP updated ✓');}catch(caught){notify(caught instanceof Error?caught.message:'Couldn’t update RSVP');}};
  return <>
    <section className={`vibe-overview-cover ${vibe.coverImageUrl ? 'has-image' : ''}`} style={vibe.coverImageUrl ? {backgroundImage: `linear-gradient(180deg,transparent,#071d49dd),url("${vibe.coverImageUrl}")`} : undefined}>
      <span className="overview-emoji">{vibe.emoji}</span>
      <div><p className="eyebrow">{vibe.type}</p><h1>{vibe.name}</h1><p>{countdown(vibe.startsAt)}</p></div>
      {admin && <button className="cover-edit" onClick={() => setDialog('overview')}><Pencil/>Edit overview</button>}
    </section>
    {navigation}
    {vibe.announcement && <section className="announcement"><Megaphone/><div><strong>Important announcement</strong><p>{vibe.announcement}</p></div></section>}
    <section className="overview-facts">
      <article><Clock3/><div><small>Date and time</small><strong>{vibe.when}</strong></div></article>
      <article><MapPin/><div><small>Location</small><strong>{vibe.location}</strong><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(vibe.location)}`} target="_blank" rel="noreferrer"><Navigation/>Directions</a></div></article>
      <article><UsersRound/><div><small>Organiser</small><strong>{organiser}</strong><span>{vibe.members.length} mates</span></div></article>
    </section>
    <div className="overview-actions">
      <button className="secondary" onClick={share}><Share2/>Share invitation</button>
      <button className="secondary" onClick={() => downloadCalendar(vibe)}><CalendarPlus/>Add to calendar</button>
    </div>
    <section className="panel rsvp-panel">
      <div className="section-heading"><div><p className="eyebrow">YOUR RSVP</p><h2>Are you coming?</h2></div><p>{counts.going} going · {counts.maybe} maybe</p></div>
      <div className="rsvp-options">{([['going','Going'],['maybe','Maybe'],['cant_go','Can’t go']] as Array<[RsvpStatus,string]>).map(([status,label])=><button key={status} className={myRsvp===status?'selected':''} aria-pressed={myRsvp===status} onClick={()=>void setRsvp(status)}>{myRsvp===status&&<Check/>}{label}</button>)}</div>
    </section>
    <section className="memories-section">
      <div className="section-heading"><div><p className="eyebrow">SHARED MEMORIES</p><h2>Albums and videos</h2></div><button onClick={()=>setDialog('album')}><Plus/>Add another album</button></div>
      <p className="helper album-intro">Photos stay in Google Photos, iCloud, OneDrive, Dropbox, YouTube or Drive. Vibemates keeps one easy link so everyone knows where to view and add memories.</p>
      {(vibe.albums??[]).length ? <div className="album-grid">{vibe.albums!.map(album=>{
        const provider=providers.find(item=>item.id===album.provider)??providers.at(-1)!;
        const canRemove=admin||album.addedByMemberId==='alex';
        return <article className="album-card" key={album.id}>
          <div className={`album-cover provider-${album.provider}`} style={album.coverImageUrl?{backgroundImage:`url("${album.coverImageUrl}")`}:undefined}><span>{provider.symbol}</span><small>{provider.label}</small></div>
          <div className="album-copy"><span className="album-provider">{provider.label}</span><h3>{album.title}</h3><p>{album.photoCount} photos · {album.videoCount} videos</p><small>Added by {album.addedByName}</small></div>
          <div className="album-actions"><a className="primary" href={album.url} target="_blank" rel="noreferrer"><ExternalLink/>Open shared album</a>{canRemove&&<button className="icon-btn danger" aria-label={`Remove ${album.title}`} onClick={async()=>{if(!confirm(`Remove “${album.title}” from this vibe? The external album will not be deleted.`))return;try{await removeLiveAlbum(membership,album.id);await onRefresh();notify('Album link removed');}catch(caught){notify(caught instanceof Error?caught.message:'Couldn’t remove album');}}}><Trash2/></button>}</div>
        </article>;
      })}</div> : <div className="album-empty"><Images/><h3>Keep every memory in one place</h3><p>Paste a shared album link. Everyone can open the original service to view or add photos.</p><button className="primary" onClick={()=>setDialog('album')}><ImagePlus/>Add the first album</button></div>}
    </section>
    {dialog==='album'&&<AlbumForm membership={membership} onClose={()=>setDialog('')} onSaved={async()=>{setDialog('');await onRefresh();notify('Shared album added ✓');}}/>}
    {dialog==='overview'&&<OverviewForm vibe={vibe} membership={membership} onClose={()=>setDialog('')} onSaved={async()=>{setDialog('');await onRefresh();notify('Overview updated ✓');}}/>}
  </>;
}

function AlbumForm({membership,onClose,onSaved}:{membership:StoredMembership;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [title,setTitle]=useState(''),[provider,setProvider]=useState<AlbumProvider>('google_photos'),[url,setUrl]=useState(''),[cover,setCover]=useState(''),[photos,setPhotos]=useState(0),[videos,setVideos]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=providers.find(item=>item.id===provider)!;
  return <Modal title="Add a shared album" onClose={onClose}><form className="stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await addLiveAlbum(membership,{title:title.trim(),provider,url:url.trim(),coverImageUrl:cover.trim(),photoCount:photos,videoCount:videos});await onSaved();}catch(caught){setError(caught instanceof Error?caught.message:'Couldn’t add album');}finally{setBusy(false);}}}>
    <div className="album-help"><strong>Three simple steps</strong><ol><li>Create or open a shared album in your photo service.</li><li>Turn on link sharing and copy the link.</li><li>Paste it below. Friends open the original app to add photos.</li></ol></div>
    <label>Album name<input required maxLength={80} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Beach BBQ memories"/></label>
    <label>Shared album link<input required type="url" inputMode="url" value={url} onChange={event=>{const value=event.target.value;setUrl(value);if(value.includes('.'))setProvider(detectProvider(value));}} placeholder="https://photos.app.goo.gl/…"/></label>
    <label>Photo service<select value={provider} onChange={event=>setProvider(event.target.value as AlbumProvider)}>{providers.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <p className="provider-help"><span>{selected.symbol}</span>{selected.hint}</p>
    <details className="optional-settings"><summary>Optional display details</summary><div className="stack album-optional"><label>Cover image link<input type="url" value={cover} onChange={event=>setCover(event.target.value)} placeholder="https://…/cover.jpg"/></label><div className="two-col"><label>Photos<input type="number" min={0} value={photos} onChange={event=>setPhotos(Number(event.target.value))}/></label><label>Videos<input type="number" min={0} value={videos} onChange={event=>setVideos(Number(event.target.value))}/></label></div></div></details>
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Adding…':'Add shared album'}</button>
  </form></Modal>;
}

function OverviewForm({vibe,membership,onClose,onSaved}:{vibe:Vibe;membership:StoredMembership;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [startsAt,setStartsAt]=useState(localInputValue(vibe.startsAt)),[locationValue,setLocationValue]=useState(vibe.location),[type,setType]=useState(vibe.type),[cover,setCover]=useState(vibe.coverImageUrl??''),[announcement,setAnnouncement]=useState(vibe.announcement??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Modal title="Edit vibe overview" onClose={onClose}><form className="stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await updateLiveOverview(membership,{startsAt,location:locationValue.trim(),type:type.trim(),coverImageUrl:cover.trim(),announcement:announcement.trim()});await onSaved();}catch(caught){setError(caught instanceof Error?caught.message:'Couldn’t update overview');}finally{setBusy(false);}}}>
    <label>Date and time<input type="datetime-local" value={startsAt} onChange={event=>setStartsAt(event.target.value)}/></label>
    <label>Location<input required value={locationValue} onChange={event=>setLocationValue(event.target.value)} placeholder="Bribie Island"/></label>
    <label>Event type<input required value={type} onChange={event=>setType(event.target.value)} placeholder="Beach BBQ"/></label>
    <label>Cover image link<input type="url" value={cover} onChange={event=>setCover(event.target.value)} placeholder="https://…/cover.jpg"/></label>
    <label>Important announcement<textarea maxLength={500} value={announcement} onChange={event=>setAnnouncement(event.target.value)} placeholder="Meet at the north entrance. Bring sunscreen."/></label>
    {error&&<p className="form-error" role="alert">{error}</p>}<button className="primary full" disabled={busy}>{busy?'Saving…':'Save overview'}</button>
  </form></Modal>;
}
