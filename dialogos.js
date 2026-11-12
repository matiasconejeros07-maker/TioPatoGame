// Lo que dicen los personajes mientras juegas. Cada fase tiene su propia lista y el juego va sacando frases al azar, sin repetir ninguna
// hasta que se acaban las de esa fase (en cada partida el orden es otro).
//
// Fases: amable (rebotes 1-29) · reto (30-54, te provocan) · enojo (55-69) · furia (70 en adelante; los personajes que se vuelven diablo usan `diablo`).
// `comun`: frases para TODOS los personajes; no hablan de sí mismos ni de su género o número, solo de ti y del juego.
// `personajes[id]`: frases propias de cada skin (se suman a las comunes). Los que no se transforman en diablo (conejos, Simi, Tíos Patitos, Galáctico, Dorado) nunca hablan del infierno.
// Los que sí se transforman (la Tía Patita, el Millonario y las skins con `devil: true` en tienda.js, como el Tío Pato) usan `diablo` del 70 en adelante en vez de `furia`.
// hitos: frases que salen justo en ese rebote (si hay varias, se elige una al azar).
// Se puede escribir: %j = tu nombre · %h = tus rebotes · %b = el récord (solo sale si ya hay uno) · %n = el nombre del personaje · %D = EL DIABLO / LA DIABLA / LOS DIABLOS.
// Y la pelota con la que juegas (moneda, billete, lingote o diamante): {la} = la moneda / el billete / el lingote de oro / el diamante · {esa} · {esta} · {una} · {nom} = moneda / billete… · {noms} = monedas / billetes…
// Con mayúscula inicial ({La}) o toda en mayúsculas ({LA}) el resultado se escribe igual.
// {pago} = lo que vale ahora cada rebote en pesos (tu pelota × las «Monedas dobles»).
window.DIALOGOS = {
  comun: {
    amable: [
      '¡Qué bien lo haces, amigo!', '¡Muy bien, campeón!', '¡Tú puedes, amigo!', '¡Wow, qué buenos reflejos!', '¡Sigue así, crack!', '¡Eres genial!',
      '¡Qué divertido, cuac!', '¡{Esa} va con ganas!', '¡Bien ahí, %j!', '¡Eso es, mueve esa barra!', '¡Qué buen rebote!', '¡Vas increíble!',
      'Ya van %h rebotes, ¡qué bacán!', '¡Nada mal para empezar!', '¡Te la estás ganando, %j!', '¡Cuac cuac! ¡Qué manos tienes!', '¡Esa barra obedece como un reloj!',
      '¡Uf, qué puntería!', '¡Dale, dale, que vas bien!', '¡Qué lindo es jugar contigo!', '¡Eso, así se hace, po!', '¡Ni se te cae {la}, qué crack!',
      '¡Sigue, sigue, que esto recién parte!', '¡Estás en racha, %j!', '¡Cada rebote cuenta, amigo!', '¡Pura buena onda y puro rebote!', 'Mmm, juegas mejor de lo que pensaba…',
      '¡Tus pesos van sonando, cling cling!', '¡Casi parece que has practicado!', '¡Aplausos para %j!'
    ],
    reto: [
      '¿Seguro que puedes con esto?', 'Veamos cuánto aguantas…', '¿Eso es todo lo que tienes?', 'No te confíes tanto, amigo', 'Ahora sí empieza lo bueno', 'Se acabó lo amable…',
      'Ya van %h rebotes… ¿y ahora qué?', 'Tu barra tiembla, ¿la ves?', '¿Te sudan las manos, %j?', 'Esto recién se pone difícil', 'Mira cómo se achica tu barra…',
      '¿Y si juegas con los ojos cerrados? Seguro te va igual', 'Qué rápido va {la}, ¿no?', 'Todavía no has visto nada', 'A ver si aguantas lo que viene',
      '¿Seguro que quieres seguir?', 'Apuesto a que no llegas a 100', 'El récord es %b rebotes. ¿Te alcanza?', 'Para el récord de %b falta bastante, ¿no?', 'Ahí viene otra… ¿la alcanzas?',
      'Se te están acabando las ideas', 'No parpadees, que se te va {la}', 'Cada rebote te cuesta más, ¿lo notas?', 'Un descuido y se acabó, %j', 'Hasta aquí fue fácil, ¿cachái?',
      'Ese rebote fue de pura suerte, lo sé', '¿Dónde quedó tu sonrisa?', 'Te veo pensando demasiado…', 'Los buenos no se ponen nerviosos. ¿Y tú?', 'Falta mucho para ganar, %j',
      'Vamos a ver de qué estás hecho', '¡Ja! Eso fue apenas el calentamiento', 'Respira hondo… que esto se acelera', 'Tus dedos van más lento que {la}',
      'Mira que ahora viene lo difícil', 'Los pesos hay que ganárselos, %j', 'Cuidado, que la barra no se cuida sola', '¡Ánimo! Lo vas a necesitar', '¿Y si {la} se te escapa justo ahora?'
    ],
    enojo: [
      '¡DEJA DE REBOTAR ESO!', '¡Basta de rebotes, %j!', '¡Esto ya no tiene gracia!', '¡Qué terquedad la tuya!', '¿Quién te enseñó a jugar así?', '¡Se acabó la paciencia!',
      '¡CUAC! ¡CUAC! ¡CUAC!', '¡No puede ser! ¡Otra vez!', '¡Ya van %h y no te caes!', '¡Suelta esa barra!', '¡{Esta} no se rinde!', '¡Estás abusando de la suerte!',
      '¿Cuándo vas a fallar, %j?', '¡ESTO ES UN ABUSO!', '¡Haz una pausa, por favor!', '¡Ya te pasaste, %j!', '¡Cada rebote es una ofensa!', '¡Alguien que pare {esta}!',
      '¡Esa barra está haciendo trampa!', '¡Qué rabia, qué rabia!', '¡Increíble! ¡Sigues rebotando!', '¡Esto es una falta de respeto!', '¡Dime que ya te cansaste!',
      'Sube la presión con cada rebote…', '¡Esto va a terminar mal, %j!', '¡Vas a lamentar cada rebote!', '¡Pierde de una vez!', '¡Ya no es gracioso!',
      '¡No hay quien se crea esta racha!', '¡Hasta aquí llegaste… o eso quisiera!'
    ],
    furia: [
      '¡NO PUEDE SEGUIR ASÍ!', '¡ESTO NO TIENE SENTIDO!', '¡CUAC! ¡CUAC! ¡CUAAAC!', '¡YA VAN %h REBOTES! ¡NO ES POSIBLE!', '¡TE ESTÁS PASANDO, %j!', '¡PARA, PARA, PARA!',
      '¡NO TE VAS A SALIR CON LA TUYA!', '¡CADA REBOTE DUELE!', '¡FALLA DE UNA VEZ!', '¡NO SE PUEDE CREER!', '¡AAARGH! ¡OTRO REBOTE MÁS!', '¡DEJA ESA BARRA QUIETA!',
      '¡Vas a quemar la barra de tanto rebotar!', '¡ESTO ES UNA LOCURA!', '¡QUE SE CAIGA YA {ESA}!', '¡HASTA CUÁNDO, %j, HASTA CUÁNDO!', '¡ES IMPOSIBLE! ¡IMPOSIBLE!',
      '¡CÓMO PUEDES SEGUIR AHÍ!', '¡CADA PUNTO ES UNA INJUSTICIA!', '¡DEJA ALGO PARA LOS DEMÁS!', '¡QUÉ RACHA MÁS INSOPORTABLE!', '¡ESTO TIENE QUE PARAR YA!',
      '¡SE ACABÓ EL JUEGO… PARA TI, OJALÁ!', '¡VAS POR %h Y NO TE CANSAS!', '¡TU BARRA ES DEMASIADO BUENA!', '¡NO HAY QUIEN TE PARE, %j!'
    ],
    hitos: {
      1: ['¡Muy bien, amigo!', '¡Empezamos! ¡A rebotar, %j!', '¡Buen primer rebote!', '¡Ahí va la primera!'],
      100: ['¡Monedas dobles! Pero ahora va en serio… 😏', '¡100! Todo vale el doble… ¿aguantas? 😏', '¡Cien rebotes! Esto recién se pone interesante 😏'],
      200: ['¡Monedas triples! ¿Hasta dónde llegas? 😈', '¡200! Triple de pesos y triple de problemas 😈', '¡Doscientos! ¿Seguro que eres humano, %j? 😈'],
      300: ['¡Monedas cuádruples! ¡Esto ya es una locura! 🤯', '¡300! ¡Nadie había llegado tan lejos, %j! 🤯'],
      400: ['¡Monedas quíntuples! ¡Eres una leyenda! 🏆', '¡400! ¡Ya casi tocas el cielo, %j! 🏆'],
      500: ['¡500! ¡Llegaste al tope, %j! 👑', '¡Ya no hay más que ganar! ¡Eres el rey! 👑']
    }
  },

  // Frases según la pelota con la que juegas (se suman a las comunes): moneda, billete, lingote o diamante.
  pelota: {
    moneda: {
      amable: ['¡Cómo gira {la}, qué linda!', 'Cling, cling… ¡qué sonido más rico!', '¡Qué brillo tiene esa monedita!', 'Gira que gira, tu monedita va feliz', '¡Esa monedita sabe rebotar!', '¡Cara y sello, pero siempre en tu barra!'],
      reto: ['¿Seguro que {la} no se te cae de la barra?', 'Una monedita tan chica… ¿y se te escapa?', '{La} gira y gira… ¿y tú ahí parado?', 'Cara o sello: ¡yo apuesto a que pierdes!', 'Vale poco, pero no la dejes caer', '¿Y si {la} cae de canto? Sería un drama'],
      enojo: ['¡Qué monedita más terca!', '¡Cara, sello… y siempre cae en tu barra!', '¡Esa moneda no se cae ni a la fuerza!', '¡Monedita, cae de una vez!', '¡Esta moneda tiene suerte de principiante!', '¡No hay moneda que aguante tanto rebote!'],
      furia: ['¡CARA, SELLO, LO QUE SEA… PERO QUE SE CAIGA!', '¡ESA MONEDITA NO SE CAE NI A PATADAS!', '¡NI UNA MONEDA RESISTE TANTO!', '¡MONEDITA TRAIDORA, CAE YA!']
    },
    billete: {
      amable: ['¡Cómo revolotea {la}, parece un pajarito!', '¡Qué lindo se ve volando ese billete!', 'Ese billete aletea como si tuviera alas', '¡Billete va, billete viene!', '¡Cuidado, que ese billete se arruga de la emoción!', '¡Qué elegante vuela {la}!'],
      reto: ['Un billete vuela distinto… ¿lo alcanzas?', 'Ojo, que {la} revolotea y se te escapa', 'Con un billete tan liviano, cualquier brisa lo desvía', '¿Seguro que puedes atrapar {una} que revolotea?', 'No dejes que el billete toque el suelo… ¡se ensucia!', 'Un billete en el aire es un billete en peligro'],
      enojo: ['¡Este billete no se cae ni con viento!', '¡Qué billete más terco!', '¡Deja de revolotear, billete!', '¡Ese billete tiene más vidas que un gato!', '¡No hay billete que aguante tanto aleteo!', '¡Este billete está hecho de acero!'],
      furia: ['¡BILLETE, CAE DE UNA VEZ!', '¡NI UN BILLETE ASÍ SE SALVA!', '¡ESE BILLETE NO SE ARRUGA NI CON ESTO!', '¡REVOLOTEA MENOS Y CAE MÁS, BILLETE!']
    },
    lingote: {
      amable: ['¡Cómo salta {la}, qué pesado y qué ágil!', '¡Qué lingote tan brillante!', '¡Salta, lingote, salta!', 'Ese lingote vale una fortuna, ¡cuídalo!', '¡Qué rico suena un lingote al rebotar!', '¡Qué buen salto, lingote!'],
      reto: ['Con {una} tan caro, un error te sale carísimo', '¿Seguro que sabes lo que pesa {la}?', 'Cuidado: un lingote no se recoge fácil del suelo', 'Cada salto del lingote vale una fortuna…', 'Si se cae {la}, ¡adiós fortuna!', 'Un lingote así de caro y tú ahí, temblando'],
      enojo: ['¡Este lingote no se cae ni a martillazos!', '¡Qué lingote más terco!', '¡Tanto salto y no se cae!', '¡Ese lingote tiene resortes!', '¡Cuánto vale ese lingote y aún no se cae!', '¡No hay lingote que aguante tanto salto!'],
      furia: ['¡LINGOTE, CAE DE UNA VEZ!', '¡NI UN LINGOTE MACIZO RESISTE TANTO SALTO!', '¡{LA} NO SE CAE NI A MARTILLAZOS!', '¡ESE LINGOTE SALTA MÁS QUE UN CANGURO!']
    },
    diamante: {
      amable: ['¡Cómo brilla {la}!', '¡Un diamante rebotando, qué lujo!', '¡Qué joya de partida!', '¡Salta, diamante, salta!', '¡Cada rebote con diamante es puro lujo!', '¡Qué destellos, qué elegancia!'],
      reto: ['Cuidado: si se cae {la}, se pierde una fortuna', '¿Tus manos son dignas de sostener una joya?', 'Un diamante es para siempre… ¿y tu partida?', 'Cada rebote vale {pago}… ¡no lo desperdicies!', '¿Y si se te rompe {la}?', 'Con {una} así, cada error duele en el bolsillo'],
      enojo: ['¡Este diamante es indestructible!', '¡Qué diamante más terco!', '¡Tanto rebote y ni un rasguño!', '¡Ese diamante rebota como pelota de goma!', '¡Cada rebote vale una fortuna y no se cae!', '¡No hay diamante que aguante tanto rebote… menos este!'],
      furia: ['¡DIAMANTE, CAE DE UNA VEZ!', '¡NI EL DIAMANTE MÁS DURO AGUANTA TANTO REBOTE!', '¡{LA} NO SE ROMPE NI A MARTILLAZOS!', '¡CADA REBOTE ES UNA FORTUNA Y NO SE CAE!']
    }
  },

  personajes: {
    // Tío Pato (el principal): ángel de traje blanco que se vuelve demonio (devil: true en tienda.js), por eso tiene fase `diablo`.
    // Las primeras frases de cada fase son las de siempre; las últimas (con 😎) son más chilenas.
    tio: {
      amable: [
        '¡Cuac! ¡Qué buen amigo eres!', 'Soy el pato más feliz del mundo', 'Mis alas aplauden por ti', 'Con esta aureola me siento dichoso', '¡Cuac cuac! ¡Juguemos toda la tarde!',
        'Dicen que soy buen perdedor… ¡mira cómo aprendo!', '¡Qué rico es rebotar {noms}, cuac!', 'Mis plumitas se erizan de alegría', 'Hoy me levanté con ganas de jugar contigo',
        '¡Soy un angelito, pero con mucha puntería!',
        '¡Bacán, %j! 😎', '¡Vas de pana, %j! 😎', '¡Qué rebote más bacán, po!', '¡La raja ese rebote! 😎', '¡Estás pulento, amigo!', '¡Filete, filete! 😎', 'Buena onda jugar contigo, cuac 😎',
        '¡Qué choro el rebote, %j!', '¡Así se juega, po! 😎', '¡Al tiro con otro igual! 😎', '¡Tamos bien, amigo! 😎', '¡Cachái que juegas bien, po!'
      ],
      reto: [
        'Los patos también tenemos orgullo, ¿sabes?', 'Mi aureola brilla menos cuando me desafían', 'Ahora sí me pongo serio, cuac', 'Mis alas ya no aplauden tanto…',
        'No subestimes a un pato, amigo', 'Me estoy calentando, ¿ves mis plumas?', '¡Ojo! Este pato no se deja ganar', 'Dicen que de ángel a demonio hay un solo paso… ¿quieres verlo?',
        'Mi aureola se está torciendo… mala señal', 'Todavía soy bueno, pero me estás tentando',
        '¿Cachái que se viene lo difícil, po? 😎', 'Ni ahí con que me ganes, %j', '¿Y tu sonrisa, po? 😎', 'Vas de pana ahora… veamos cómo vas después 😎', 'Qué fome si te caes justo ahora, ¿ah?',
        '¿Seguro que tienes manos para esto? 😎', 'Dale nomás, que yo aquí te espero 😎', 'Te veo medio nervioso, %j… ¡relájate, po!', 'Ahora sí que se puso bueno, ¿cachái?', 'Estás muy confiado, amigo 😎'
      ],
      enojo: [
        'Se me acabó la paciencia, cuac', '¡Mi aureola se derritió, %j!', '¡Siento que me salen cuernos!', '¡Ya me estás sacando de quicio!', '¡Nadie me gana, nadie!',
        '¡Te voy a destrozar la barra!', '¡Estoy perdiendo la paciencia!', '¡Me sale humo del pico!', '¡Mis plumas se ponen rojas de rabia!', 'Ya no soy tan amable, ¿cachái?',
        '¡Ya po, cae de una vez!', '¡Qué lata, %j, qué lata!', '¡Me tienes chato, po!', '¡Estoy chato de tanto rebote!', '¡Ni ahí con seguir así!', '¡Ya basta, po, que me estoy picando!',
        '¡No puede ser, po, otra vez!', '¡Me estoy picando, cuac!', '¡Qué mala pata, esto me tiene chato!'
      ],
      diablo: [
        '¡MUAJAJAJA! ¡Eres mío!', '¡Arde, mortal!', '¡Bienvenido al infierno, cuac!', '¡NO ESCAPARÁS!', '¡Soy %n del infierno!', '¡Quémate!', '¡Mis alas de diablo tienen hambre de {noms}!',
        '¡Aquí abajo hace calorcito, ¿no?!', '¡El infierno es mío y tú eres mi invitado!', '¡Sufre, sufre, mortal!', '¡Mis llamas no se apagan con rebotes!', '¡Hasta el diablo se asombra de ti, cuac!',
        '¡Ya po, arde nomás! 😈', '¡Te voy a achicharrar, %j!', '¡El infierno está bacán, quédate nomás! 😈', '¡Ni ahí con escapar, po!', '¡Dale que dale, que aquí no se acaba! 😈',
        '¡Vas de pana, pero ahora te achicharro! 😎🔥', '¡Me tienes chato y calentito, po!', '¡Qué fome es perder, po… pero tú no lo sabes!'
      ],
      hitos: {
        10: ['¡Diez! ¡Vas de pana, %j! 😎', '¡Bacán, ya van diez! 😎'],
        20: ['¡Veinte! ¡La raja, amigo! 😎', '¡Veinte rebotes! Estás pulento 😎'],
        30: ['Mmm… ya me cansé de ser amable', 'Se terminó la amabilidad, amigo', 'Hasta aquí llegó mi lado bueno'],
        55: ['¡Se me acabó la paciencia! ¡AAARGH! 😡', '¡YA BASTA! ¡AAARGH! 😡', '¡Mi aureola se rompió! ¡CUAAAC! 😡'],
        60: ['¡AHORA SOY %D! 😈', '¡ME CONVIERTO EN %D! 😈', '¡MIREN, SOY %D! 😈'],
        80: ['¡80! ¡Qué bacán, %j, qué bacán! 😎🔥', '¡Ochenta! Hasta el infierno te aplaude, po 😎🔥'],
        120: ['¡120! ¡Eres la raja, %j! 😎🔥', '¡Ciento veinte! ¡Vas de pana hasta en el infierno! 😎🔥'],
        150: ['¡150! ¡Bacán, bacán, bacán! 😎🔥', '¡Ciento cincuenta! ¡Eres un crack, po! 😎🔥']
      }
    },

    tia: {
      amable: [
        '¡Cuac! ¡Qué lindo es jugar contigo, cariño!', 'Mi moñito brilla por ti', 'Soy una angelita con mucho estilo', '¡Qué educado rebotas, %j!', 'Hoy me puse mis mejores plumas',
        '¡Ay, qué emoción, cuac cuac!', '¡Me encanta cómo juegas, cielo!', 'Con ese rebote me derrites el corazoncito', 'Una angelita feliz es una pata feliz', 'Qué bonito baila tu barra'
      ],
      reto: [
        'Ay, no me subestimes, cariño', 'Hasta los angelitos tenemos carácter', 'Mi moño se ladea… ¡cuidado!', 'Ya se me acaba la dulzura, ¿lo notas?', '¡Ojito! Esta patita no se deja',
        'No me hagas perder la compostura, %j', 'Qué atrevimiento… ¡me gusta!', 'Mis alitas empiezan a temblar de rabia', 'Me estás sacando la ternura a empujones', 'Mmm, ¿con esa puntería quieres ganarme?'
      ],
      enojo: [
        '¡Se me acabó la dulzura, %j!', '¡Ya me tienes harta!', '¡Mis alas se ponen rojas de rabia!', '¡Ay, qué rabia, qué rabia, cuac!', '¡Nadie me gana, nadie!',
        '¡Te voy a destrozar la barra, cariño!', '¡Me sacas de quicio!', '¡Se me torció el moño de la furia!', '¡Esto ya no es amable, cielo!'
      ],
      diablo: [
        '¡MUAJAJAJA! ¡Eres mío, cariño!', '¡Arde, mortal!', '¡Bienvenido al infierno, cuac!', '¡NO ESCAPARÁS!', '¡Soy %n del infierno!', '¡Quémate, cielo!',
        '¡Mis cuernitos ya te tienen el ojo puesto!', '¡Hasta el infierno se pone elegante conmigo!', '¡Qué calorcito, ¿no?!', '¡SOY LA DIABLA MÁS ELEGANTE!'
      ],
      hitos: {
        30: ['Mmm… ya me cansé de ser dulce', 'Se acabó la ternura, cariño', 'Hasta aquí llegó mi lado bueno, cielo'],
        55: ['¡Se me acabó la paciencia! ¡AAARGH! 😡', '¡YA ME TIENES HARTA! ¡CUAAAC! 😡', '¡Se me desató el moño! ¡CUAAAC! 😡'],
        60: ['¡AHORA SOY %D! 😈', '¡ME CONVIERTO EN %D! 😈', '¡MIREN, SOY %D! 😈']
      }
    },

    conejo: {
      amable: [
        '¡Estoy más contento que conejo en la huerta!', '¡Qué zanahoria de partida!', '¡Saltas casi tan bien como yo!', '¡Mis orejas aplauden por ti!', '¡Cuac y orejas, qué combo!',
        'Ni el conejo más veloz rebotaría así', 'Esto me da hambre de zanahorias', '¡Brinco de alegría, cuac!', '¡Mi colita de conejo se mueve sola!', '¡Soy mitad pato, mitad conejo y todo diversión!'
      ],
      reto: [
        'Los conejos también sabemos correr, ¿sabes?', 'Mis orejas ya captaron tu estrategia…', '¿Crees que un pato con orejas se cansa?', 'Mi paciencia da saltitos… y se acaba',
        'Veamos si me alcanzas', 'Estas orejas oyen todo, ¡hasta tus dudas!', 'No me confundas: soy pato, pero salto', 'Mmm, me están picando las ganas de ganar',
        'Hasta las zanahorias tienen límite', 'Mi colita peluda dice que no confíes'
      ],
      enojo: [
        '¡Me pusiste las orejas de punta, %j!', '¡Tengo las orejas paradas de la rabia!', '¡Estoy más rojo que una zanahoria!', '¡Salto de rabia, cuac!', '¡Mi paciencia se fue saltando!',
        '¡Ya basta, que se me enredan las orejas!', '¡No me hagas zapatear como conejo!', '¡Se me está acabando la zanahoria… digo, la paciencia!'
      ],
      furia: [
        '¡Estoy que echo humo por las orejas!', '¡Ni una zanahoria me calma ahora!', '¡Voy a dar un salto de furia, cuac!', '¡Mis orejas están al rojo vivo!', '¡CUAC! ¡Esto me tiene a mil por hora!',
        '¡Se me erizó hasta la colita!', '¡Soy un conejo MUY enojado!', '¡Me están hirviendo las orejas!'
      ],
      hitos: {
        30: ['Mmm… se me acabaron las zanahorias amables', 'Ya me cansé de ser simpático', 'Mis orejas dicen que esto se puso serio'],
        55: ['¡Se me acabó la paciencia! ¡Me enojé de verdad! 😡', '¡Orejas arriba, estoy ENOJADO! 😡', '¡CUAAAC! ¡Ya no más! 😡'],
        60: ['¡Ahora sí estoy furioso, cuac! 😡', '¡Me están saliendo chispas por las orejas! 😡', '¡Estoy que salto de la rabia! 😡']
      }
    },

    conejita: {
      amable: [
        '¡Qué zanahoria de partida, cielo!', '¡Mis orejitas aplauden por ti!', '¡Saltas casi tan bien como yo!', '¡Qué lindo rebote, cuac!', 'Brinco de la emoción', 'Mi colita de conejita no para de moverse',
        '¡Eres un amor jugando!', '¡Estoy más feliz que una conejita en primavera!', '¡Cuac, cuac! ¡Cuánta ternura!', '¡Qué bonita partida!'
      ],
      reto: [
        'Las conejitas también tenemos carácter', 'Mis orejas ya te escucharon pensar', 'No me subestimes por ser tierna', 'Veamos si me alcanzas, cielo', 'Mi ternura tiene un límite, ¿sabes?',
        'Cuidado: una conejita enojada salta muy lejos', 'Se me están parando las orejitas…', 'Mmm, ya no me hace tanta gracia', 'Hasta las zanahorias se acaban', 'Te estás ganando un buen salto… de rabia'
      ],
      enojo: [
        '¡Se me pararon las orejas de la rabia!', '¡Ya me tienes harta, %j!', '¡Estoy más roja que una zanahoria!', '¡Salto de rabia, cuac!', '¡Se me acabó la ternura!', '¡Mi colita está erizada de rabia!',
        '¡No me hagas patalear!', '¡Ay, qué enojo, qué enojo!'
      ],
      furia: [
        '¡Estoy que echo humo por las orejas!', '¡Ni una zanahoria me calma ahora!', '¡Voy a dar un salto de furia, cuac!', '¡Mis orejas están al rojo vivo!', '¡Se me erizó hasta la colita!',
        '¡Soy una conejita MUY enojada!', '¡CUAC! ¡Esto me tiene a mil!', '¡Me hierven las orejitas!'
      ],
      hitos: {
        30: ['Mmm… se me acabó la ternura', 'Ya me cansé de ser dulce, cielo', 'Mis orejitas dicen que esto se puso serio'],
        55: ['¡Se me acabó la paciencia! ¡Me enojé de verdad! 😡', '¡Orejitas arriba, estoy ENOJADA! 😡', '¡CUAAAC! ¡Ya no más! 😡'],
        60: ['¡Ahora sí estoy furiosa, cuac! 😡', '¡Me están saliendo chispas por las orejas! 😡', '¡Estoy que salto de la rabia! 😡']
      }
    },

    teleton: {
      amable: [
        '¡Con la gorra bien puesta, vamos!', '¡Esto va con corazón, %j!', '¡Qué buen equipo hacemos!', '¡Así se hace, campeón!', '¡Cada rebote suma, cuac!', '¡Qué alegría jugar contigo!',
        '¡Bien ahí, %j! ¡Eso es ponerle ganas!', '¡Mi camiseta aplaude por ti!', '¡Todos a una, rebote tras rebote!', '¡Qué buena onda tienes!'
      ],
      reto: [
        '¡Ahora a ponerle más corazón!', 'A ver si le sigues el ritmo a mi gorra…', '¿Seguro que aguantas todo el partido?', 'Esto recién se pone entretenido', 'Hasta la camiseta me aprieta de la emoción',
        'No te me achiques, %j', '¿Y esa puntería? ¡Demuéstrala!', 'Las buenas causas también compiten, ¿sabes?', 'Mi gorra dice que puedes más', 'A mí no me ganas por cansancio'
      ],
      enojo: [
        '¡Se me arrugó la gorra de la rabia!', '¡Me estás sacando los colores, %j!', '¡Hasta la camiseta se me puso más roja!', '¡Ya basta, que me acalambras el ala!', '¡Se me acabó la paciencia, cuac!',
        '¡No me hagas tirar la gorra al suelo!', '¡Estoy más rojo que el logo de mi camiseta!', '¡Esto me tiene a mil!'
      ],
      furia: [
        '¡Estoy que echo humo por debajo de la gorra!', '¡CUAC! ¡Voy a perder la paciencia!', '¡Me hierve hasta la camiseta!', '¡Tanto rebote me tiene furioso!', '¡Ni con corazón aguanto esto!',
        '¡Soy un pato MUY enojado!', '¡Se me erizaron hasta las plumas!', '¡Me van a salir chispas de la gorra!'
      ],
      hitos: {
        30: ['Mmm… se me acabó la buena onda', 'Ya me cansé de ser tan simpático', 'La gorra dice que esto se puso serio'],
        55: ['¡Se me acabó la paciencia! ¡Me enojé de verdad! 😡', '¡Gorra abajo, estoy ENOJADO! 😡', '¡CUAAAC! ¡Ya no más! 😡'],
        60: ['¡Ahora sí estoy furioso, cuac! 😡', '¡Me están saliendo chispas por la gorra! 😡', '¡Estoy que salto de la rabia! 😡']
      }
    },

    bigotes: {
      amable: [
        '¡Excelente jugada, mi estimado!', '¡Qué elegancia, amigo!', 'Mi bigote tiembla de emoción', '¡Un aplauso con guante blanco!', 'Esto es lo que yo llamo clase', '¡Bravo, bravísimo, cuac!',
        'Permítame felicitarle por ese rebote', '¡Qué distinción al rebotar!', 'Mi sombrero de copa se levanta por usted', '¡Tomemos el té después de esta partida!'
      ],
      reto: [
        'Un caballero nunca se rinde, ¿y usted?', 'Veamos si tiene clase para esto', 'Mi bigote presiente problemas…', 'No confunda mi elegancia con debilidad', 'Esto ya no es un paseo en bata',
        'Ajusto mi sombrero: ahora va en serio', 'Un pato de mi categoría no pierde, estimado', 'Mi bata de seda no se arruga ante cualquiera', 'Cuidado con subestimar un bigote como este',
        'Mmm, ¿seguro que sabe a lo que se enfrenta?'
      ],
      enojo: [
        '¡Mi bigote se está erizando, %j!', '¡Esto es una falta de respeto!', '¡Se me cayó la compostura!', '¡Por mi sombrero de copa, esto es intolerable!', '¡Mi bata de seda no merece este trato!',
        '¡Qué descaro el suyo!', '¡He perdido los estribos, cuac!', '¡Ya no queda té que me calme!'
      ],
      furia: [
        '¡MI BIGOTE ESTÁ AL ROJO VIVO!', '¡Esto es INACEPTABLE!', '¡Por todos los sombreros de copa del mundo!', '¡Se me salió el sombrero de tanto rabiar!', '¡CUAC! ¡NO SE PUEDE, NO SE PUEDE!',
        '¡He perdido hasta los modales!', '¡Mi bigote parece un cepillo de la rabia!', '¡ESTO ES UN ESCÁNDALO!'
      ],
      hitos: {
        30: ['Mmm… se acabaron los buenos modales', 'La cortesía tiene un límite, estimado', 'Dejemos a un lado la etiqueta'],
        55: ['¡Se me acabó la paciencia! ¡AAARGH! 😡', '¡Esto es una ofensa a mi bigote! 😡', '¡CUAAAC! ¡He perdido la compostura! 😡'],
        60: ['¡Ahora sí estoy FURIOSO, estimado! 😡', '¡Mi sombrero salió volando de la rabia! 😡', '¡Esto ya es un escándalo! 😡']
      }
    },

    tios: {
      amable: [
        '¡Nos encanta jugar contigo!', '¡Qué divertido, cuac cuac!', '¡Los dos aplaudimos por ti!', '¡Somos los patitos más felices!', 'Juntos somos invencibles… ¡bueno, casi!', '¡Cuac y recuac, qué partidón!',
        'Uno devuelve y el otro celebra', '¡Qué lindo es jugar en pareja!', 'Mi cielo, ¿viste ese rebote?', 'Mira, mi vida, ¡cómo rebota {la}!'
      ],
      reto: [
        '¿Crees que puedes con los dos?', 'Dos patos pueden más que uno, ¿cachái?', 'Nos estamos poniendo serios, amigo', 'Mi amor, ¿ya jugamos en serio? ¡Sí, mi vida!', 'Doble defensa, doble problema para ti',
        'No nos subestimes: somos dos', 'Se nos acaba la paciencia, a los dos', 'Nos estamos poniendo nerviosos… y eso es peligroso', 'Mmm, ya no nos hace tanta gracia', 'Juntos te vamos a ganar'
      ],
      enojo: [
        '¡Se nos acabó la paciencia a los dos!', '¡Nos tienes hartos, %j!', '¡Estamos enojados! ¡Los dos!', '¡Ya no nos hace gracia!', '¡Nos sacas de quicio, cuac cuac!', '¡Basta, que nos tienes en pie de guerra!',
        '¡Hasta mi pareja está roja de rabia!', '¡No nos hagas pelear… entre nosotros!', '¡Nadie nos gana, nadie!'
      ],
      furia: [
        '¡LOS DOS ESTAMOS FURIOSOS!', '¡CUAC CUAC! ¡CUAC CUAC!', '¡Hasta nos peleamos entre nosotros de la rabia!', '¡ESTO ES UNA LOCURA, CUAC!', '¡Nos hierve la sangre a los dos!',
        '¡DEJA DE REBOTAR, POR FAVOR! ¡LOS DOS TE LO PEDIMOS!', '¡Estamos al rojo vivo!', '¡NO NOS HAGAS ENOJAR MÁS!'
      ],
      hitos: {
        30: ['Mmm… ya nos cansamos de ser amables', 'Se nos acabó la amabilidad, a los dos', 'Mi amor, ¿les ponemos un límite? ¡Sí!'],
        55: ['¡Se nos acabó la paciencia! ¡AAARGH! 😡', '¡LOS DOS ESTAMOS ENOJADOS! 😡', '¡CUAAAC! ¡Ya no más! 😡'],
        60: ['¡Ahora sí estamos furiosos! 😡', '¡Nos salen chispas a los dos! 😡', '¡Esto ya es una pelea de patos! 😡']
      }
    },

    // Los dos últimos (Galáctico y el secreto Dorado) tienen muchas más frases y provocan más: hay para que no se repitan en una partida larga.
    // Tío Pato Galáctico: cósmico y burlón. Al enojarse se le eriza la melena morada y le salen rayos en los puños (no habla del infierno).
    galactico: {
      amable: [
        '¡Qué rebote tan estelar, %j!', 'Mi cabeza guarda una galaxia entera… ¡y ahí cabe tu puntería!', '¡Cuac cósmico! Esto es lo mejor del universo', 'Tus rebotes brillan como estrellas',
        'Hasta los planetas se detienen a mirarte', '¡Qué órbita más perfecta tiene {la}!', 'Dicen que soy un pato de otro mundo… ¡y tú de otra galaxia!', '¡Sigue así, astronauta!',
        'Mi sombrero de copa viene de la Vía Láctea', 'Hasta el Big Bang aplaudió ese rebote', '¡Estás en órbita, %j!', 'Mi galaxia gira de la emoción', '¡Qué buen aterrizaje, comandante!',
        'Con esa puntería, la NASA te contrata', '¡Despegamos! ¡Cuac, cuac!', 'Brillas más que una supernova'
      ],
      reto: [
        'El universo es infinito… ¿tu paciencia también?', 'Soy un pato de otro mundo, ¿y tú de cuál?', 'Hasta un agujero negro se aburre con tus rebotes', '¿Esto es todo lo que ofrece tu planeta?',
        'La luz tarda años en llegar… tu próximo fallo ya viene', 'Los astros dicen que vas a fallar pronto', 'No eres el primer terrícola que intenta ganarme', 'Mi galaxia gira más rápido que tu barra',
        '¿Y si {la} desaparece en un agujero negro?', 'Cuidado: la gravedad siempre gana, %j', 'Veamos cuánto aguantas, terrícola', 'Tu barra se achica como una estrella enana',
        'Mi órbita es más estable que la tuya', '¿Sientes la presión cósmica?', 'Un error y te vuelves polvo de estrellas', 'Ya van %h rebotes… en el espacio nadie te oye fallar'
      ],
      enojo: [
        '¡Mi galaxia gira de rabia, %j!', '¡Se me está formando un agujero negro de la furia!', '¡Esto es una supernova de mal humor!', '¡Terrícola terco!', '¡Me hierven las estrellas!',
        '¡Hasta los planetas se alinearon en tu contra… y aun así!', '¡Mi sombrero salió en órbita!', '¡Tus rebotes desordenan mi constelación!', '¡Voy a explotar como una estrella!',
        '¡Me estás sacando de órbita!', '¡Ni la gravedad te para!', '¡Esto va a terminar en un Big Bang!', '¡Mi cabeza es un torbellino!'
      ],
      furia: [
        '¡MI GALAXIA SE DESATA!', '¡AGUJERO NEGRO, TRÁGATE {ESA}!', '¡SUPERNOVAAAA!', '¡EL UNIVERSO ENTERO TIENE QUE PARAR!', '¡TODO EL COSMOS TIEMBLA, %j!', '¡ME CONVIERTO EN TORMENTA ESTELAR!',
        '¡CUAC CÓSMICO!', '¡LAS ESTRELLAS ESTÁN EXPLOTANDO!', '¡NO HAY GALAXIA QUE AGUANTE ESTO!', '¡FALLA DE UNA VEZ, TERRÍCOLA!', '¡MI PLANETA SE SACUDE!',
        '¡ESTO ES EL FIN DEL UNIVERSO!', '¡METEORITOS, A MÍ!', '¡NI UN AGUJERO NEGRO TE TRAGA!', '¡PUÑOS ESTELARES, A LA CARGA!', '¡MI MELENA CÓSMICA SE ERIZÓ!', '¡RAYOS DE GALAXIA, DESPIERTEN!'
      ],
      hitos: {
        10: ['¡Diez! Todavía estás en órbita baja 🚀', '¡Ya van diez, astronauta! 🚀'],
        20: ['¡Veinte! Ya saliste de la atmósfera 🚀', '¡Veinte rebotes! Qué rápido llegas a la Luna 🚀'],
        30: ['Mmm… el universo se está poniendo serio', 'Se acabó el paseo espacial, amigo', 'Mi galaxia acaba de acelerar'],
        45: ['¡45! Se me está calentando la galaxia ☄️', '¡45 rebotes! Las estrellas empiezan a inquietarse ☄️'],
        55: ['¡Mi galaxia se enciende! ¡CUAAAC! 😡', '¡Se me acabó la paciencia cósmica! 😡', '¡Explota la primera estrella! 😡'],
        60: ['¡Mi melena se erizó! ¡Soy una tormenta cósmica! ⚡', '¡Puños estelares, a la carga! ⚡', '¡Soy una supernova con pico! ⚡'],
        80: ['¡80! ¡Ni los cometas van tan rápido! ☄️', '¡Ochenta! Las estrellas hablan de ti ☄️'],
        120: ['¡120! Hasta los agujeros negros te respetan 🌌', '¡Ciento veinte! ¿Seguro que eres terrícola, %j? 🌌'],
        150: ['¡150! Eres una constelación nueva 🌌', '¡Ciento cincuenta! El universo se rinde ante ti 🌌']
      }
    },

    // Tío Pato Dorado (el secreto de $100.000.000; su id sigue siendo millonario): rey presumido y millonario. Al enojarse su oro se vuelve brasa (no habla del infierno).
    millonario: {
      amable: [
        '¡Un rey de oro aprueba ese rebote!', 'Mi corona brilla un poquito más gracias a ti', 'Cada rebote tuyo vale su peso en oro', '¡Qué modales tan reales, %j!', '¡Cuac, cuac! ¡Salve el campeón!',
        'Todo lo que toco se vuelve oro… hasta tu partida', 'Mi corte aplaude de pie', 'Puedes ser mi caballero real, %j', 'Con este traje negro hasta los reyes me envidian', 'Qué puntería digna de un reino',
        '¡Brilla, brilla, %j!', '¡Cuac real!', 'Hoy el rey está de buen humor', 'Mi tesoro y tú: lo mejor de mi reino', 'Un aplauso real para %j', '¡Bien jugado, plebeyo… digo, amigo!',
        'Con tus rebotes me haces más rico', '¡Cada {nom} suena a música!', 'Soy tan millonario que hasta mis plumas son de oro', '¡Qué buena inversión eres, %j!', 'Mi fortuna crece con cada rebote',
        'Hasta mi chofer aplaude', 'El oro brilla, pero tu juego brilla más', '¡Cuac de oro, cuac de lujo!', 'Esto sí es vida de millonario', 'Después de esto, caviar para todos'
      ],
      reto: [
        'Un rey no pierde contra un plebeyo, ¿lo sabías?', 'Mi corona pesa… pero tu paciencia pesa menos', '¿Te atreves a desafiar a la realeza?', 'Mi reino nunca ha sido conquistado',
        'Para ganarme hay que tener sangre de oro, %j', 'Se te están acabando los súbditos… digo, los rebotes', 'Un rey siempre gana la última partida', 'Mi tesoro es más grande que tu ego',
        'Cuidado: la corona se pone pesada cuando me enojo', 'Rebotas bien… ¡para ser plebeyo!', 'Tu barra no vale ni una moneda de mi tesoro', 'Mis guardias ya preparan tu destierro',
        'El trono es mío, amigo', 'Ya van %h rebotes… ¡ni un siervo aguanta tanto!', 'No me hagas quitarme la corona', '¿Todo el oro del mundo y tú sin poder fallar?',
        'Un millonario no se deja ganar, ¿sabes?', 'Tengo oro para aburrir… ¿y tú?', 'Mis monedas valen más que tu puntería', '¿Crees que puedes con una fortuna como la mía?',
        'Para ganarme hay que ser millonario… ¿lo eres?', 'Ya me aburrí de regalarte puntos', 'Mi banco no pierde, amigo', 'Estoy contando mis monedas… y tú vas perdiendo las tuyas',
        'Mi caja fuerte está más segura que tu barra'
      ],
      enojo: [
        '¡Tu insolencia es un insulto al reino, %j!', '¡Mi corona se está calentando!', '¡Guardias! ¡Detengan a este plebeyo!', '¡Se me derrite el oro de la rabia!', '¡Ya no soy tan generoso con los rebotes!',
        '¡Esto es una traición a la corona!', '¡Mi tesoro tiembla de rabia!', '¡Un rey no debería sufrir esto!', '¡Se me oscurece el oro, cuac!', '¡Te voy a desterrar de mi reino!',
        '¡Mis rubíes están al rojo vivo!', '¡Mis plumas doradas se ponen naranjas!', '¡Esto es alta traición!', '¡CUAC REAL! ¡CUAC REAL!',
        '¡Esto me está costando una fortuna!', '¡Llamen a mi contador, esto es un robo!', '¡Estás gastando mi paciencia, que vale millones!', '¡Mi paciencia se agrietó como un lingote!',
        '¡Pierdo millones por tu culpa!', '¡Eso fue un robo a mano alzada!'
      ],
      furia: [
        '¡MI CORONA ARDE AL ROJO VIVO!', '¡SOY EL REY DE LAS BRASAS!', '¡TODO EL ORO SE HACE LAVA!', '¡ARRODÍLLATE ANTE EL REY ARDIENTE!', '¡MI REINO SE INCENDIA POR TU CULPA, %j!',
        '¡CUAAAC! ¡REY EN LLAMAS!', '¡EL ORO OSCURO NO PERDONA!', '¡MIS RUBÍES SE ESTÁN FUNDIENDO!', '¡GUARDIAS, A LA TORRE CON ESTE PLEBEYO!', '¡MI TESORO ES MÁS GRANDE QUE TU PACIENCIA… Y QUE LA MÍA!',
        '¡ESTE TRONO ESTÁ HIRVIENDO!', '¡NADIE LE GANA AL REY!', '¡FALLA DE UNA VEZ, PLEBEYO!', '¡MI CORONA SE ESTÁ DERRITIENDO DE LA RABIA!'
      ],
      hitos: {
        10: ['¡Diez rebotes! Mi corte te observa 👑', '¡Ya van diez! Voy a anotarlo en el libro real 👑'],
        20: ['¡Veinte! Vas camino a duque 👑', '¡Veinte rebotes! Mi tesorero está impresionado 👑'],
        30: ['Mmm… el rey se está aburriendo de ser amable', 'Se acabó la cortesía real, amigo', 'Mi corona se siente pesada de repente', 'Mmm… se me acabó la generosidad', 'Ya no regalo más puntos, amigo'],
        45: ['¡45! Se me está calentando el oro 🔥', '¡45 rebotes! Los guardias empiezan a sudar 🔥'],
        55: ['¡Se me enciende la corona! ¡CUAAAC! 😡', '¡HASTA AQUÍ LLEGÓ EL REY BUENO! 😡', '¡Mi oro se está poniendo negro! 😡', '¡ESTO ME ESTÁ COSTANDO UNA FORTUNA! 😡', '¡Mi corona se torció de la rabia! 😡'],
        60: ['¡AHORA SOY EL REY ARDIENTE! 🔥', '¡MI ORO ES BRASA! 🔥', '¡ARRODÍLLENSE, QUE ARDE EL TRONO! 🔥'],
        80: ['¡80! Hasta mis rubíes se asustan 🔥', '¡Ochenta! Ningún súbdito había llegado tan lejos 🔥'],
        120: ['¡120! Te mereces un reino propio 👑', '¡Ciento veinte! Me quitaría la corona por ti… ¡pero no! 👑'],
        150: ['¡150! ¡Eres el nuevo rey del tablero! 👑', '¡Ciento cincuenta! ¡Este trono tiene dos asientos! 👑']
      }
    }
  }
};
