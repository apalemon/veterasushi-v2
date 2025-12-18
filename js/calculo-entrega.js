// ============================================
// CÁLCULO DE DISTÂNCIA E TAXA DE ENTREGA
// ============================================

// Endereço base do restaurante
const ENDERECO_BASE = {
    endereco: 'Rua Doutor Joao Palombini, 580, Ipanema, Porto Alegre, RS',
    lat: -30.134,   // Coordenadas de Ipanema, Porto Alegre
    lng: -51.230
};

// Configurações de entrega
const CONFIG_ENTREGA = {
    taxaMinima: 3.00,      // R$ 3,00 mínimo (até 2km)
    taxaPorKm: 4.00,       // R$ 4,00 por km adicional acima de 2km
    distanciaMaxima: 12    // Máximo 12km
};

// Buscar coordenadas de um endereço
async function buscarCoordenadas(endereco) {
    try {
        const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}&limit=1`;
        
        const response = await fetch(geocodeUrl, {
            headers: {
                'User-Agent': 'VeteraSushi/1.0'
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao geocodificar endereço');
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            throw new Error('Endereço não encontrado');
        }
        
        return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            enderecoEncontrado: data[0].display_name
        };
    } catch (error) {
        console.error('Erro ao buscar coordenadas:', error);
        return null;
    }
}

// Cache de coordenadas do endereço base
let coordenadasBaseCache = null;

// Calcular distância usando API pública (Nominatim - OpenStreetMap)
async function calcularDistancia(enderecoDestino) {
    try {
        // Buscar coordenadas do endereço base (com cache)
        let baseLat = ENDERECO_BASE.lat;
        let baseLng = ENDERECO_BASE.lng;
        
        // Se coordenadas não estiverem definidas ou cache vazio, buscar
        if ((!baseLat || !baseLng) && !coordenadasBaseCache) {
            const coordsBase = await buscarCoordenadas(ENDERECO_BASE.endereco);
            if (coordsBase) {
                coordenadasBaseCache = coordsBase;
                baseLat = coordsBase.lat;
                baseLng = coordsBase.lng;
            }
        } else if (coordenadasBaseCache) {
            baseLat = coordenadasBaseCache.lat;
            baseLng = coordenadasBaseCache.lng;
        }
        
        // Buscar coordenadas do destino
        const coordsDestino = await buscarCoordenadas(enderecoDestino);
        if (!coordsDestino) {
            throw new Error('Endereço de destino não encontrado. Verifique se o endereço está correto.');
        }
        
        // Calcular distância usando fórmula de Haversine
        const distancia = calcularDistanciaHaversine(
            baseLat,
            baseLng,
            coordsDestino.lat,
            coordsDestino.lng
        );
        
        return {
            sucesso: true,
            distancia: distancia, // em km
            enderecoEncontrado: coordsDestino.enderecoEncontrado,
            coordenadas: {
                lat: coordsDestino.lat,
                lng: coordsDestino.lng
            }
        };
    } catch (error) {
        console.error('Erro ao calcular distância:', error);
        return {
            sucesso: false,
            erro: error.message,
            distancia: null
        };
    }
}

// Calcular distância usando fórmula de Haversine
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;
    return distancia;
}

// Calcular taxa de entrega baseada na distância
function calcularTaxaEntrega(distancia) {
    if (!distancia || distancia <= 0) {
        return {
            sucesso: false,
            taxa: 0,
            mensagem: 'Distância inválida'
        };
    }
    
    // Verificar se está dentro do raio de entrega
    if (distancia > CONFIG_ENTREGA.distanciaMaxima) {
        return {
            sucesso: false,
            taxa: 0,
            distancia: parseFloat(distancia.toFixed(2)),
            mensagem: `Endereço muito distante! A distância de ${distancia.toFixed(2)}km excede nosso limite de entrega de ${CONFIG_ENTREGA.distanciaMaxima}km. Infelizmente não podemos realizar entregas nesta região.`
        };
    }
    
    // Calcular taxa
    let taxa = CONFIG_ENTREGA.taxaMinima; // Taxa mínima (até 2km)
    
    // Acima de 2km: R$ 4,00 por cada km adicional
    if (distancia > 2) {
        const kmExtras = distancia - 2;
        taxa += kmExtras * CONFIG_ENTREGA.taxaPorKm;
    }
    
    return {
        sucesso: true,
        taxa: parseFloat(taxa.toFixed(2)),
        distancia: parseFloat(distancia.toFixed(2)),
        mensagem: `Taxa de entrega: R$ ${taxa.toFixed(2)} (${distancia.toFixed(2)}km)`
    };
}

// Calcular taxa de entrega a partir de um endereço
async function calcularTaxaEntregaPorEndereco(endereco) {
    const resultadoDistancia = await calcularDistancia(endereco);
    
    if (!resultadoDistancia.sucesso) {
        return {
            sucesso: false,
            erro: resultadoDistancia.erro || 'Erro ao calcular distância',
            taxa: 0
        };
    }
    
    const resultadoTaxa = calcularTaxaEntrega(resultadoDistancia.distancia);
    
    return {
        ...resultadoTaxa,
        enderecoEncontrado: resultadoDistancia.enderecoEncontrado,
        coordenadas: resultadoDistancia.coordenadas
    };
}

// Exportar funções
window.calcularDistancia = calcularDistancia;
window.calcularTaxaEntrega = calcularTaxaEntrega;
window.calcularTaxaEntregaPorEndereco = calcularTaxaEntregaPorEndereco;

