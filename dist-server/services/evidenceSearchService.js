import { randomUUID } from 'crypto';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || '';
const FLICKR_API_KEY = process.env.FLICKR_API_KEY || '';
function milesToMeters(miles) {
    return miles * 1609.344;
}
function buildTextQuery(propertyLabel, stormDate) {
    return [propertyLabel, stormDate, 'hail storm'].filter(Boolean).join(' ');
}
function makeCandidateId(provider, externalId, stormDate) {
    return `${provider}-${externalId}-${stormDate ?? 'undated'}`
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-');
}
function buildFallbackCandidate(provider, propertyLabel, stormDate) {
    const query = buildTextQuery(propertyLabel, stormDate);
    const url = provider === 'youtube'
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : `https://www.flickr.com/search/?text=${encodeURIComponent(query)}`;
    return {
        id: makeCandidateId(provider, query, stormDate),
        provider,
        title: provider === 'youtube'
            ? `YouTube search pack for ${stormDate ?? propertyLabel}`
            : `Flickr search pack for ${stormDate ?? propertyLabel}`,
        url,
        thumbnailUrl: null,
        mediaType: 'link',
        stormDate,
        publishedAt: null,
        sourceState: 'fallback',
        notes: provider === 'youtube'
            ? 'YouTube API key not configured. This is a ready-to-open source pack.'
            : 'Flickr API key not configured. This is a ready-to-open source pack.',
    };
}
async function searchYoutubeCandidates(params, stormDate) {
    if (!YOUTUBE_API_KEY) {
        return [buildFallbackCandidate('youtube', params.propertyLabel, stormDate)];
    }
    const query = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '5',
        q: buildTextQuery(params.propertyLabel, stormDate),
        key: YOUTUBE_API_KEY,
        location: `${params.lat},${params.lng}`,
        locationRadius: `${Math.round(milesToMeters(params.radiusMiles ?? 25))}m`,
        order: 'date',
    });
    if (stormDate) {
        query.set('publishedAfter', `${stormDate}T00:00:00Z`);
        query.set('publishedBefore', `${stormDate}T23:59:59Z`);
    }
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${query.toString()}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
        throw new Error(`YouTube search returned ${response.status}`);
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) {
        return [buildFallbackCandidate('youtube', params.propertyLabel, stormDate)];
    }
    return items.map((item) => {
        const videoId = item?.id?.videoId || randomUUID();
        return {
            id: makeCandidateId('youtube', videoId, stormDate),
            provider: 'youtube',
            title: item?.snippet?.title || 'YouTube video',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnailUrl: item?.snippet?.thumbnails?.high?.url ||
                item?.snippet?.thumbnails?.medium?.url ||
                item?.snippet?.thumbnails?.default?.url ||
                null,
            mediaType: 'video',
            stormDate,
            publishedAt: item?.snippet?.publishedAt || null,
            sourceState: 'live',
            notes: item?.snippet?.channelTitle
                ? `Channel: ${item.snippet.channelTitle}`
                : undefined,
        };
    });
}
async function searchFlickrCandidates(params, stormDate) {
    if (!FLICKR_API_KEY) {
        return [buildFallbackCandidate('flickr', params.propertyLabel, stormDate)];
    }
    const query = new URLSearchParams({
        method: 'flickr.photos.search',
        api_key: FLICKR_API_KEY,
        format: 'json',
        nojsoncallback: '1',
        text: buildTextQuery(params.propertyLabel, stormDate),
        lat: String(params.lat),
        lon: String(params.lng),
        radius: String(Math.min(params.radiusMiles ?? 25, 32)),
        radius_units: 'mi',
        extras: 'date_upload,date_taken,geo,url_l,url_m,url_n,owner_name',
        sort: 'date-posted-desc',
        per_page: '5',
        content_type: '1',
        media: 'photos',
    });
    if (stormDate) {
        const minTaken = `${stormDate} 00:00:00`;
        const maxTaken = `${stormDate} 23:59:59`;
        query.set('min_taken_date', minTaken);
        query.set('max_taken_date', maxTaken);
    }
    const response = await fetch(`https://www.flickr.com/services/rest/?${query.toString()}`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
        throw new Error(`Flickr search returned ${response.status}`);
    }
    const data = await response.json();
    const items = Array.isArray(data?.photos?.photo) ? data.photos.photo : [];
    if (items.length === 0) {
        return [buildFallbackCandidate('flickr', params.propertyLabel, stormDate)];
    }
    return items.map((item) => {
        const photoId = String(item.id || randomUUID());
        const thumbnailUrl = item.url_m || item.url_n || item.url_l || null;
        return {
            id: makeCandidateId('flickr', photoId, stormDate),
            provider: 'flickr',
            title: item.title || 'Flickr photo',
            url: `https://www.flickr.com/photos/${item.owner}/${item.id}`,
            thumbnailUrl,
            mediaType: 'image',
            stormDate,
            publishedAt: item.datetaken || item.dateupload || null,
            sourceState: 'live',
            notes: item.ownername ? `Owner: ${item.ownername}` : undefined,
        };
    });
}
export async function searchEvidenceCandidates(params) {
    const uniqueStormDates = Array.from(new Set(params.stormDates.filter(Boolean).slice(0, 2)));
    const effectiveDates = uniqueStormDates.length > 0 ? uniqueStormDates : [null];
    const results = await Promise.all(effectiveDates.flatMap((stormDate) => [
        searchYoutubeCandidates(params, stormDate),
        searchFlickrCandidates(params, stormDate),
    ]));
    return {
        candidates: results.flat(),
        providerStatus: {
            youtube: YOUTUBE_API_KEY ? 'live' : 'fallback',
            flickr: FLICKR_API_KEY ? 'live' : 'fallback',
        },
    };
}
