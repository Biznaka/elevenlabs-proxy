// server.js - Servidor proxy para ElevenLabs + GPT personalizado
// Requiere Node.js instalado

const express = require('express');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'tu_api_key_aqui';
const BASE_URL = process.env.BASE_URL || `https://elevenlabs-proxy-production-3ede.up.railway.app	`;

// Middleware
app.use(express.json());
app.use('/audio', express.static('audio_files'));

// Crear carpeta para audios si no existe
if (!fs.existsSync('./audio_files')) {
  fs.mkdirSync('./audio_files');
}

// Limpiar archivos antiguos cada hora
setInterval(() => {
  const files = fs.readdirSync('./audio_files');
  const now = Date.now();
  files.forEach(file => {
    const filePath = path.join('./audio_files', file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtimeMs;
    // Eliminar archivos de más de 1 hora
    if (age > 3600000) {
      fs.unlinkSync(filePath);
      console.log(`Archivo eliminado: ${file}`);
    }
  });
}, 3600000);

// ENDPOINT PRINCIPAL: Generar audio y devolver URL
app.post('/v1/text-to-speech/:voice_id', async (req, res) => {
  try {
    const { voice_id } = req.params;
    const { text, model_id, voice_settings } = req.body;
    const output_format = req.query.output_format || 'mp3_44100_128';

    // Validar texto
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'El texto es requerido' });
    }

    console.log(`Generando audio para: "${text.substring(0, 50)}..."`);

    // Llamar a ElevenLabs
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        text,
        model_id: model_id || 'eleven_multilingual_v2',
        voice_settings: voice_settings || {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true
        }
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        params: { output_format },
        responseType: 'arraybuffer'
      }
    );

    // Generar nombre único para el archivo
    const filename = `${crypto.randomBytes(16).toString('hex')}.mp3`;
    const filepath = path.join('./audio_files', filename);

    // Guardar el audio
    fs.writeFileSync(filepath, response.data);

    // Devolver URL pública
    const audioUrl = `${BASE_URL}/audio/${filename}`;

    res.json({
      success: true,
      audio_url: audioUrl,
      voice_id,
      text_length: text.length,
      model: model_id || 'eleven_multilingual_v2',
      message: 'Audio generado exitosamente. El archivo estará disponible por 1 hora.'
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'API key inválida' });
    }
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Voice ID no encontrado' });
    }
    if (error.response?.status === 429) {
      return res.status(429).json({ error: 'Límite de cuota excedido' });
    }

    res.status(500).json({ 
      error: 'Error al generar audio',
      details: error.message 
    });
  }
});

// Endpoint para listar voces disponibles
app.get('/v1/voices', async (req, res) => {
  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error al obtener voces:', error.message);
    res.status(500).json({ error: 'Error al obtener voces' });
  }
});

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ElevenLabs Proxy',
    uptime: process.uptime()
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor proxy corriendo en ${BASE_URL}`);
  console.log(`📝 Endpoints disponibles:`);
  console.log(`   POST ${BASE_URL}/v1/text-to-speech/:voice_id`);
  console.log(`   GET  ${BASE_URL}/v1/voices`);
  console.log(`   GET  ${BASE_URL}/health`);
});

module.exports = app;
