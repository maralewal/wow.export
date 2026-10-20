const net = require('net');
const fs = require('fs');
const path = require('path');
const { randomBytes, randomUUID, timingSafeEqual } = require('crypto');

const MAX_REQUEST_BYTES = 65536;
const MAX_JOBS = 100;

const startBridge = async ({ dataPath, search, exportModel, convertTexture, exportCurrentCharacter, importArmoryCharacter, isReady, isBusy }) => {
	const token = randomBytes(32).toString('hex');
	const tokenBytes = Buffer.from(token);
	const discoveryPath = path.join(dataPath, 'mcp-bridge.json');
	const jobs = new Map();
	let activeJob = null;

	const startJob = (method, params) => {
		if (!isReady())
			throw new Error('Open a WoW installation in wow.export before exporting.');
		if (isBusy())
			throw new Error('wow.export is busy. Try again when the current task finishes.');
		if (activeJob)
			throw new Error('An MCP export is already running.');

		const id = randomUUID();
		const job = { id, type: method, status: 'running', startedAt: new Date().toISOString() };
		jobs.set(id, job);
		while (jobs.size > MAX_JOBS)
			jobs.delete(jobs.keys().next().value);
		activeJob = id;

		Promise.resolve().then(() => {
			switch (method) {
				case 'export_model': return exportModel(params.fileDataID, params.format);
				case 'convert_texture': return convertTexture(params.fileDataID, params.format);
				case 'export_current_character': return exportCurrentCharacter(params.format);
				case 'import_armory_character': return importArmoryCharacter(params.region, params.realm, params.name);
			}
		}).then(result => {
			job.result = result;
			job.status = result?.failed?.length || result?.succeeded === false || result?.succeeded?.length === 0 || result === undefined ? 'failed' : 'succeeded';
			if (job.status === 'failed')
				job.error = result?.error ?? result?.failed?.[0]?.error ?? 'Export did not complete.';
		}).catch(error => {
			job.status = 'failed';
			job.error = error.message;
		}).finally(() => {
			job.finishedAt = new Date().toISOString();
			activeJob = null;
		});

		return { jobId: id, status: job.status };
	};

	const handle = (request) => {
		const supplied = typeof request?.token === 'string' ? Buffer.from(request.token) : Buffer.alloc(0);
		if (supplied.length !== tokenBytes.length || !timingSafeEqual(supplied, tokenBytes))
			throw new Error('Unauthorized.');

		const params = request.params ?? {};
		switch (request.method) {
			case 'search_assets': {
				if (!isReady())
					throw new Error('Open a WoW installation in wow.export before searching.');
				if (typeof params.query !== 'string' || params.query.trim().length < 3 || params.query.length > 200)
					throw new Error('query must be 3–200 characters.');
				if (!['any', 'model', 'texture'].includes(params.type))
					throw new Error('Invalid asset type.');
				if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 50)
					throw new Error('limit must be 1–50.');
				return search(params.query.toLowerCase(), params.type, params.limit);
			}
			case 'export_model':
				if (!['OBJ', 'GLTF', 'GLB', 'STL'].includes(params.format))
					throw new Error('Invalid model format.');
				if (!Number.isSafeInteger(params.fileDataID) || params.fileDataID < 1)
					throw new Error('Invalid fileDataID.');
				return startJob(request.method, params);
			case 'convert_texture':
				if (!['PNG', 'WEBP', 'BLP'].includes(params.format))
					throw new Error('Invalid texture format.');
				if (!Number.isSafeInteger(params.fileDataID) || params.fileDataID < 1)
					throw new Error('Invalid fileDataID.');
				return startJob(request.method, params);
			case 'export_current_character':
				if (!['OBJ', 'GLTF', 'GLB', 'STL'].includes(params.format))
					throw new Error('Invalid character format.');
				return startJob(request.method, params);
			case 'import_armory_character':
				if (!['us', 'eu', 'kr', 'tw', 'classic-us', 'classic-eu', 'classic-kr', 'classic-tw'].includes(params.region))
					throw new Error('Invalid region.');
				if (typeof params.realm !== 'string' || !/^[\p{L}\p{N}-]{1,80}$/u.test(params.realm))
					throw new Error('Invalid realm slug.');
				if (typeof params.name !== 'string' || !/^[\p{L}\p{N}-]{2,24}$/u.test(params.name))
					throw new Error('Invalid character name.');
				return startJob(request.method, params);
			case 'get_job_status':
				if (typeof params.jobId !== 'string' || !jobs.has(params.jobId))
					throw new Error('Unknown jobId.');
				return jobs.get(params.jobId);
			default:
				throw new Error('Unknown method.');
		}
	};

	const server = net.createServer(socket => {
		socket.setTimeout(30000, () => socket.destroy());
		let data = '';
		let handled = false;
		socket.on('data', chunk => {
			if (handled)
				return;
			data += chunk.toString('utf8');
			if (Buffer.byteLength(data) > MAX_REQUEST_BYTES) {
				socket.destroy();
				return;
			}
			const end = data.indexOf('\n');
			if (end < 0)
				return;
			handled = true;
			try {
				const result = handle(JSON.parse(data.slice(0, end)));
				socket.end(JSON.stringify({ ok: true, result }) + '\n');
			} catch (error) {
				socket.end(JSON.stringify({ ok: false, error: error.message }) + '\n');
			}
			data = '';
		});
	});

	try {
		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		const info = { port: server.address().port, token, pid: process.pid, version: 1 };
		fs.writeFileSync(discoveryPath, JSON.stringify(info), { mode: 0o600 });
	} catch (error) {
		server.close();
		throw error;
	}

	const close = () => {
		server.close();
		try {
			const current = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
			if (current.token === token)
				fs.unlinkSync(discoveryPath);
		} catch { /* The bridge may already have been replaced or removed. */ }
	};

	return { close, discoveryPath, port: server.address().port };
};

module.exports = { startBridge };
