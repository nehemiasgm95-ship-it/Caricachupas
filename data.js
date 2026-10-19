// Temas, listas de palabras válidas y castigos. Las palabras van sin acentos;
// la lógica normaliza todo antes de comparar. Varias palabras se unen con "_".
// level: 1 = popular/fácil, 2 = medio, 3 = difícil (decide en qué dificultad sale el tema).
(function (root) {
  const LETTERS = 'ABCDEFGHIJLMNOPRSTV'.split('');
  const words = (s) => s.split(/\s+/).filter(Boolean).map((x) => x.replace(/_/g, ' '));

  const CUATRO_PATAS = words(`
    perro gato caballo vaca toro cerdo puerco oveja cabra burro mula conejo liebre zorro lobo oso tigre leon
    leopardo jaguar puma pantera elefante jirafa cebra rinoceronte hipopotamo camello llama alpaca vicuna venado
    ciervo alce bufalo bisonte ardilla raton rata hamster cobayo cuy mapache tejon nutria comadreja hiena coyote
    chacal panda koala canguro armadillo tlacuache zarigueya perezoso tapir jabali ocelote lince guepardo gorila
    chimpance mono orangutan tortuga lagartija iguana cocodrilo caiman lagarto salamandra rana sapo ajolote gacela
    antilope yak mamut ornitorrinco erizo oso_polar oso_pardo gato_montes lobo_marino leon_marino
    tigre_blanco tuza marmota castor huron gineta mangosta suricata lemur ternero becerro potro yegua cordero
    cachorro gatito chihuahua poodle bulldog pastor_aleman labrador husky pitbull dalmata beagle chita
    cabrito cerdito rinoceronte capibara chinchilla hurón mandril babuino
  `);

  const OTROS_ANIMALES = words(`
    aguila halcon buho lechuza paloma gorrion canario loro perico guacamaya tucan flamenco pelicano cisne pato
    ganso gallina gallo pavo pollo avestruz pinguino colibri cuervo zopilote gaviota albatros condor buitre pajaro
    tiburon ballena delfin orca pulpo calamar medusa pez atun salmon trucha sardina bagre mojarra pulga hormiga
    abeja avispa mosca mosquito zancudo mariposa libelula cucaracha grillo saltamontes escarabajo catarina arana
    escorpion alacran gusano caracol babosa lombriz serpiente culebra vibora cobra boa anaconda foca morsa manati
    cangrejo langosta camaron almeja estrella_de_mar murcielago ostra tortuga_marina caballito_de_mar anguila
    pez_payaso pez_globo raya tiburon_blanco ballena_azul avispon mariquita luciernaga polilla termita chinche
    piojo garrapata cienpies milpies mantis cigarra
  `);

  const PAISES = words(`
    alemania argelia arabia_saudita angola armenia argentina australia austria belgica bolivia brasil bulgaria
    camboya camerun canada chile china chipre colombia corea costa_rica croacia cuba dinamarca ecuador egipto
    el_salvador escocia eslovaquia eslovenia espana estados_unidos estonia etiopia filipinas finlandia francia
    gabon georgia ghana grecia guatemala guinea haiti holanda honduras hungria india indonesia inglaterra irak
    iran irlanda islandia israel italia jamaica japon jordania kenia libano libia lituania luxemburgo malasia
    marruecos mexico mongolia nepal nicaragua nigeria noruega nueva_zelanda panama paraguay peru polonia
    portugal puerto_rico reino_unido republica_dominicana rumania rusia senegal serbia singapur siria somalia
    sudafrica suecia suiza tailandia tanzania tunez turquia ucrania uganda uruguay venezuela vietnam yemen
    zambia zimbabue afganistan albania bahamas bangladesh belice benin birmania bosnia botsuana butan catar
    chad congo costa_de_marfil cuba djibouti emiratos_arabes eritrea fiyi gambia granada guyana jamaica kuwait
    laos lesoto letonia liberia madagascar malawi mali malta mauricio moldavia monaco mozambique namibia
    niger omán oman pakistan palestina papua paraguay ruanda samoa sudan suriname tayikistan togo tonga
    trinidad_y_tobago turkmenistan uzbekistan vanuatu
  `);

  const FRUTAS = words(`
    manzana pera platano banana naranja mandarina limon lima toronja uva fresa frambuesa zarzamora arandano mora
    cereza ciruela durazno melocoton albaricoque chabacano sandia melon papaya mango pina guayaba maracuya mamey
    zapote tamarindo coco higo datil kiwi granada guanabana chirimoya lichi tuna pitahaya carambola membrillo
    nispero aguacate capulin jicama tejocote pasas ciruela_pasa nectarina pomelo mangostan rambutan durian
    zapote_negro cereza_negra uchuva feijoa guama pitaya jocote nance caimito marañon maranon
  `);

  const VERDURAS = words(`
    zanahoria papa patata cebolla ajo tomate jitomate lechuga espinaca acelga brocoli coliflor repollo col
    calabaza calabacin pepino pimiento chile apio betabel remolacha rabano nabo elote maiz chicharo guisante
    frijol habas lentejas ejote berenjena champinon hongo esparrago alcachofa puerro perejil cilantro albahaca
    jengibre camote yuca nopal chayote jicama cebollin cebolla_morada col_de_bruselas endivia hinojo
    garbanzo soya tomatillo epazote hierbabuena romero tomillo oregano laurel
  `);

  const COLORES = words(`
    rojo azul verde amarillo naranja morado violeta rosa rosado negro blanco gris cafe marron beige celeste
    turquesa dorado plateado fucsia magenta lila lavanda cian vino granate crema anaranjado oro bronce coral
    salmon mostaza oliva esmeralda carmesi purpura indigo anil ocre aqua azul_marino azul_rey verde_limon
    verde_militar rojo_vino rosa_mexicano amarillo_patito aguamarina caqui terracota marfil arena
  `);

  const NOMBRES_MUJER = words(`
    ana maria sofia valentina camila isabella lucia paula andrea daniela fernanda gabriela carolina natalia laura
    sara carmen rosa patricia monica claudia veronica alejandra adriana beatriz brenda berenice diana elena eva
    emma erika fabiola gloria guadalupe irene jessica julia karla leticia liliana lorena luisa marcela marta
    mariana mercedes miriam nancy olga paola pamela raquel regina rebeca silvia sandra susana tania teresa
    ursula vanessa victoria viviana ximena yolanda zoe abril aurora alicia amanda angelica antonia barbara
    blanca bianca catalina celia cecilia cristina dolores dulce esmeralda estefania fatima flor frida gisela
    graciela ingrid itzel jazmin jimena josefina juana lidia lupita magdalena margarita martha melissa mia
    nadia nora norma paulina perla romina rocio ruth sabrina selena tatiana valeria wendy
  `);

  const NOMBRES_HOMBRE = words(`
    juan jose luis carlos jorge pedro miguel angel antonio francisco javier fernando manuel ricardo roberto
    eduardo daniel david diego alejandro andres adrian alberto alfredo arturo benito bruno cesar cristian dario
    emilio enrique ernesto esteban felipe gabriel gerardo gonzalo guillermo gustavo hector hugo ignacio ivan
    jesus joaquin julio leonardo lorenzo marcos mario martin mateo nicolas oscar pablo rafael ramon raul
    rodrigo samuel santiago sergio tomas victor vicente abraham agustin aaron alan amado armando axel bernardo
    camilo claudio damian domingo edgar efrain elias emiliano erick fabian gael gilberto gregorio humberto
    isaac israel jaime jonathan kevin leandro leon lucas marco mauricio maximiliano moises nestor noe octavio
    omar orlando patricio ramiro reynaldo salvador sebastian simon teodoro ulises valentin walter xavier zacarias
  `);

  const COMIDA_MEXICANA = words(`
    taco tamal torta quesadilla enchilada pozole mole chilaquiles tostada sope huarache gordita elote esquites
    birria barbacoa carnitas cochinita_pibil tlayuda chile_relleno guacamole salsa frijoles arroz menudo pambazo
    flautas panucho cemita machaca tinga pastor alambre molote empanada tlacoyo cecina chicharron fajitas nachos
    burrito churros flan tepache atole chiles_en_nogada tacos_al_pastor sopa_azteca caldo_de_pollo birote
    ahogada torta_ahogada gringa campechana dorados gorditas huevos_rancheros machitos migas chalupas
    tamales_oaxaquenos enfrijoladas entomatadas capirotada buñuelos bunuelos pan_dulce concha cuernito
    chamoy cajeta jericalla rompope pulque mezcal tequila horchata jamaica
  `);

  const MARCAS_AUTOS = words(`
    toyota honda nissan mazda ford chevrolet volkswagen audi bmw mercedes kia hyundai fiat renault peugeot
    citroen volvo jeep dodge chrysler tesla ferrari lamborghini porsche maserati bugatti mitsubishi suzuki
    subaru lexus infiniti acura buick cadillac gmc ram seat skoda mini land_rover jaguar bentley rolls_royce
    mclaren alfa_romeo dacia opel saab isuzu byd chery geely pontiac lincoln hummer mercury ssangyong
  `);

  const CUERPO = words(`
    cabeza cara ojo oreja nariz boca labio lengua diente muela cuello hombro brazo codo muneca mano dedo pulgar
    indice pecho espalda cintura cadera ombligo estomago panza vientre pierna rodilla tobillo pie talon
    pantorrilla muslo nalga trasero corazon pulmon higado rinon cerebro hueso costilla columna ceja pestana
    frente mejilla barbilla menton cabello pelo garganta axila pulgar anular menique nudillo palma pelvis
    craneo femur tibia peroné perone humero cubito radio clavicula esternon vertebra intestino vejiga pancreas
    esofago traquea laringe paladar encia nuca sien parpado pupila iris retina timpano
  `);

  const PROFESIONES = words(`
    medico doctor enfermero maestro profesor abogado ingeniero arquitecto contador cocinero chef panadero
    carnicero plomero electricista carpintero albanil mecanico piloto policia bombero soldado juez dentista
    veterinario psicologo periodista actor cantante pintor escultor escritor musico bailarin fotografo taxista
    chofer conductor camionero agricultor granjero pescador cartero barbero peluquero estilista sastre zapatero
    joyero banquero vendedor cajero mesero barista programador disenador astronauta cientifico biologo
    quimico fisico matematico secretario gerente director presidente senador diputado astronomo bibliotecario
    cirujano pediatra psiquiatra nutriologo fisioterapeuta farmaceutico notario traductor intérprete interprete
    locutor presentador youtuber torero payaso mago vigilante guardia detective espia marinero capitan
    herrero jardinero lavandero costurera empleado obrero ama_de_casa limpiador pastor sacerdote monja
  `);

  const DEPORTES = words(`
    futbol baloncesto basquetbol beisbol tenis voleibol natacion atletismo boxeo lucha judo karate taekwondo
    ciclismo golf rugby hockey esqui surf skate patinaje gimnasia esgrima remo vela equitacion polo padel
    badminton ping_pong squash softbol handball balonmano pesas triatlon maraton automovilismo karting
    escalada alpinismo senderismo crossfit yoga futbol_americano tenis_de_mesa charreria lucha_libre
    clavados buceo snorkel paracaidismo parapente rafting kayak canotaje bolos billar dardos ajedrez
    arqueria tiro_con_arco salto_de_altura salto_de_longitud lanzamiento_de_jabalina decatlon pentatlon
    sumo capoeira kung_fu aikido jiu_jitsu muay_thai kickboxing wushu bmx motocross
  `);

  const SIMPSON = words(`
    homero marge bart lisa maggie abraham abuelo_simpson mona patty selma moe barney lenny carl apu ned flanders
    maude rod todd milhouse nelson ralph rafa_gorgory wiggum clancy skinner seymour edna krabappel krusty burns
    senor_burns smithers willie otto cletus brandine troy_mcclure lionel_hutz kent_brockman rainier_wolfcastle
    snake bob_patino itchy scratchy tomy daly duffman hibbert doctor_hibbert nick_riviera jimbo dolph kearney
    martin_prince sherri terri quimby fat_tony disco_stu kang kodos ayudante_de_santa bola_de_nieve helen_lovejoy
    reverendo_lovejoy lovejoy hombre_abeja comisario_wiggum ralph_wiggum agnes_skinner ling jasper
    doris eddie lou mr_burns professor_frink frink gil sideshow_mel
  `);

  const DISNEY = words(`
    mickey minnie donald goofy pluto daisy simba nala mufasa scar timon pumba rafiki bambi tambor flor dumbo
    pinocho pepe_grillo geppetto blancanieves cenicienta aurora bella bestia ariel sebastian flounder ursula
    jasmine aladdin genio abu mulan mushu pocahontas tarzan jane hercules megara hades rapunzel flynn elsa anna
    olaf kristoff sven moana maui tiana naveen merida woody buzz jessie rex hamm slinky sulley mike boo nemo
    dory marlin coral bruce crush wall_e eva carl russell dug remy linguini rayo_mcqueen mate sally miguel
    hector coco mirabel bruno luisa isabela dolores camilo antonio alegria tristeza furia ira miedo asco
    disgusto stitch lilo baloo mowgli bagheera kaa shere_khan cruella malefica jafar gaston lumiere pascal
    maximus pumbaa mike_wazowski randall frozono sr_increible mirage edna_moda pato_donald
    chip dale gus jaq pedro_pan peter_pan campanita garfio wendy
  `);

  const SUPERHEROES = words(`
    superman batman robin flash linterna_verde mujer_maravilla aquaman cyborg shazam supergirl batgirl nightwing
    spiderman hombre_arana iron_man hulk thor capitan_america viuda_negra ojo_de_halcon pantera_negra
    doctor_strange ant_man avispa capitana_marvel star_lord groot rocket gamora drax thanos loki deadpool
    wolverine cíclope ciclope tormenta rogue gambito magneto profesor_x bestia daredevil punisher venom
    ghost_rider blade mr_fantastic mujer_invisible antorcha_humana la_cosa chapulin_colorado el_chapulin_colorado
    batichica catwoman joker harley_quinn pinguino acertijo bane lex_luthor doomsday green_arrow flecha_verde
    atom canario_negro zatanna raven starfire chico_bestia vision bruja_escarlata quicksilver falcon
    soldado_del_invierno nebula mantis wong shang_chi eternos ms_marvel kamala miles_morales gwen_stacy
    capitan_marvel hombre_de_hierro hombre_hormiga mujer_gato superchica
  `);

  const CANTANTES = words(`
    shakira bad_bunny karol_g maluma j_balvin daddy_yankee don_omar wisin yandel ozuna anuel nicky_jam
    rauw_alejandro feid peso_pluma grupo_frontera fuerza_regida natanael_cano junior_h eslabon_armado luis_miguel
    juan_gabriel vicente_fernandez alejandro_fernandez pepe_aguilar jose_jose camilo_sesto rocio_durcal selena
    thalia paulina_rubio belinda gloria_trevi alejandra_guzman julieta_venegas natalia_lafourcade cafe_tacvba
    mana caifanes molotov enanitos_verdes soda_stereo charly_garcia gustavo_cerati fito_paez los_tigres_del_norte
    los_bukis los_angeles_azules banda_ms la_arrolladora intocable ricky_martin enrique_iglesias julio_iglesias
    marc_anthony romeo_santos aventura prince_royce juanes carlos_vives fonseca silvestre_dangond chayanne
    luis_fonsi ricardo_arjona alejandro_sanz miguel_bose david_bisbal pablo_alboran rosalia c_tangana bizarrap
    nicki_nicole tini duki michael_jackson madonna beyonce rihanna taylor_swift ed_sheeran adele bruno_mars
    lady_gaga katy_perry justin_bieber ariana_grande billie_eilish dua_lipa the_weeknd drake eminem queen
    los_beatles beatles rolling_stones elvis_presley frank_sinatra bob_marley coldplay maroon_5 imagine_dragons
    metallica nirvana acdc u2 bon_jovi aerosmith kiss pink_floyd led_zeppelin celia_cruz tito_puente gloria_estefan
    jenni_rivera lupillo_rivera espinoza_paz gerardo_ortiz christian_nodal ana_gabriel marco_antonio_solis
    cristian_castro lucero yuri laura_pausini selena_gomez demi_lovato miley_cyrus britney_spears shakira
    rbd camila reik sin_bandera cnco ha_ash
  `);

  const PELICULAS = words(`
    titanic avatar shrek frozen coco up cars toy_story buscando_a_nemo monsters_inc ratatouille intensamente
    encanto moana el_rey_leon aladdin la_bella_y_la_bestia mulan tarzan hercules matrix gladiador rocky rambo
    terminator alien depredador volver_al_futuro et indiana_jones star_wars jurassic_park tiburon batman
    superman spiderman avengers iron_man thor joker barbie oppenheimer inception interstellar tenet dunkerque
    rapidos_y_furiosos harry_potter el_senor_de_los_anillos el_hobbit piratas_del_caribe casablanca psicosis
    forrest_gump pulp_fiction titanic parasitos coraje_el_perro_cobarde madagascar kung_fu_panda como_entrenar_a_tu_dragon
    mi_villano_favorito los_minions ice_age cars_2 wall_e los_increibles bichos hormiguitaz pocahontas
    pinocho dumbo bambi peter_pan la_sirenita cenicienta blancanieves la_dama_y_el_vagabundo dalmatas
    amores_perros y_tu_mama_tambien roma el_laberinto_del_fauno nosotros_los_nobles no_se_aceptan_devoluciones
    mexico_lindo_y_querido cantinflas coco_2 scary_movie la_mascara ace_ventura mentiroso_mentiroso el_padrino
    scarface goodfellas rocky_balboa top_gun misión_imposible mision_imposible james_bond duro_de_matar
    mad_max el_exorcista chucky annabelle it saw scream halloween viernes_13 pesadilla_en_la_calle_del_infierno
  `);

  const SERIES = words(`
    friends los_simpson south_park padre_de_familia breaking_bad game_of_thrones stranger_things la_casa_de_papel
    narcos el_chavo_del_ocho el_chapulin_colorado la_rosa_de_guadalupe el_chavo_animado dragon_ball dragon_ball_z
    naruto pokemon los_caballeros_del_zodiaco sailor_moon bob_esponja los_padrinos_magicos hora_de_aventura
    ben_10 los_jóvenes_titanes los_jovenes_titanes coraje_el_perro_cobarde el_laboratorio_de_dexter johnny_bravo
    las_chicas_superpoderosas el_show_de_los_osos escandalosos tom_y_jerry el_correcaminos los_picapiedra
    los_supersonicos scooby_doo pocoyo peppa_pig masha_y_el_oso paw_patrol dora_la_exploradora backyardigans
    barney plaza_sesamo the_office la_que_se_avecina rebelde teresa los_ricos_tambien_lloran marimar
    la_usurpadora rubi mirada_de_mujer yo_soy_betty_la_fea betty_la_fea la_reina_del_sur el_senor_de_los_cielos
    club_de_cuervos la_familia_peluche cero_en_conducta una_familia_de_diez vecinos 31_minutos
    the_walking_dead lost dr_house breaking_bad better_call_saul peaky_blinders la_casa_de_las_flores
    gossip_girl riverdale squid_game el_juego_del_calamar wednesday merlina elite
  `);

  const DRAGON_BALL = words(`
    goku vegeta gohan goten trunks piccolo krilin bulma yamcha tenshinhan chaoz freezer cell majin_buu bills whis
    broly raditz nappa zarbon dodoria ginyu vegetto gogeta oolong puar maestro_roshi chichi videl milk
    mr_satan dende kaito supremo_kaiosama kaio_sama shenlong picolo mr_popo bardock gine tarble dr_gero
    androide_17 androide_18 androide_16 cooler paragus janemba hit jiren toppo kefla zamasu goku_black
    babidi dabura tapion garlick turles slug coola
  `);

  const VIDEOJUEGOS = words(`
    mario luigi peach toad bowser yoshi donkey_kong wario waluigi daisy rosalina link zelda ganondorf samus kirby
    pikachu sonic tails knuckles eggman crash_bandicoot lara_croft kratos master_chief pacman minecraft fortnite
    fifa pes call_of_duty gta grand_theft_auto the_sims among_us tetris pong space_invaders street_fighter
    mortal_kombat tekken pokemon_go clash_royale candy_crush free_fire roblox league_of_legends dota halo
    god_of_war uncharted fall_guys angry_birds temple_run subway_surfers genshin_impact zelda_breath_of_the_wild
    ryu ken chun_li sub_zero scorpion donkey_kong_country megaman dr_mario metroid fire_emblem animal_crossing
    splatoon smash_bros mario_kart
  `);

  const POKEMON = words(`
    pikachu charmander bulbasaur squirtle charizard blastoise venusaur pidgey rattata caterpie weedle butterfree
    beedrill raichu sandshrew nidoran clefairy vulpix ninetales jigglypuff zubat oddish psyduck growlithe
    arcanine poliwag abra kadabra alakazam machop geodude ponyta slowpoke magnemite onix drowzee gengar krabby
    voltorb exeggcute cubone hitmonlee lickitung koffing rhyhorn chansey tangela kangaskhan horsea goldeen
    staryu mr_mime scyther jynx electabuzz magmar pinsir tauros magikarp gyarados lapras ditto eevee vaporeon
    jolteon flareon porygon omanyte kabuto aerodactyl snorlax articuno zapdos moltres dratini dragonair
    dragonite mewtwo mew togepi meowth mankey primeape ekans arbok paras venonat diglett dugtrio persian
    golduck poliwhirl tentacool seel dewgong grimer muk shellder cloyster haunter hypno kingler electrode
    marowak weezing rhydon seadra seaking starmie omastar kabutops lucario greninja gardevoir mimikyu
    charmeleon wartortle ivysaur pidgeot sandslash nidoking nidoqueen wigglytuff golbat vileplume
  `);

  const FUTBOL_EQUIPOS = words(`
    america chivas cruz_azul pumas tigres rayados monterrey toluca santos leon pachuca atlas necaxa puebla
    queretaro mazatlan juarez tijuana san_luis atlante guadalajara real_madrid barcelona atletico_de_madrid
    sevilla valencia betis villarreal athletic_club real_sociedad manchester_united manchester_city liverpool
    chelsea arsenal tottenham juventus milan inter roma napoli lazio bayern_munich borussia_dortmund psg ajax
    benfica porto boca_juniors river_plate flamengo palmeiras corinthians independiente racing penarol nacional
    colo_colo universidad_de_chile olimpia saprissa lyon marsella monaco leicester everton newcastle
    west_ham aston_villa atalanta fiorentina bayer_leverkusen sao_paulo fluminense gremio cruzeiro
    inter_miami la_galaxy lafc seattle_sounders
  `);

  const SELECCIONES = words(`
    mexico argentina brasil uruguay colombia chile peru ecuador paraguay venezuela bolivia estados_unidos canada
    costa_rica panama honduras jamaica espana francia alemania italia portugal inglaterra holanda belgica
    croacia suiza dinamarca suecia polonia serbia japon corea_del_sur australia marruecos senegal nigeria camerun
    ghana tunez egipto arabia_saudita iran qatar gales escocia irlanda austria turquia ucrania noruega
    republica_checa grecia hungria rumania el_salvador guatemala haiti cuba trinidad_y_tobago curazao
  `);

  const FUTBOLISTAS = words(`
    messi cristiano ronaldo neymar mbappe haaland lewandowski benzema modric kroos salah de_bruyne vinicius pele
    maradona zidane ronaldinho beckham iniesta xavi puyol casillas ramos pique buffon pirlo totti maldini
    cruyff platini henry kaka rivaldo romario cafu chicharito ochoa rafa_marquez hugo_sanchez cuauhtemoc_blanco
    jorge_campos luis_suarez cavani falcao james_rodriguez valderrama higuita chilavert forlan batistuta
    riquelme di_maria dybala lautaro julian_alvarez alexis_sanchez vidal zamorano salas lozano tecatito
    raul_jimenez santi_gimenez edson_alvarez memo_ochoa carlos_vela giovani_dos_santos andres_guardado
    javier_hernandez paolo_maldini gerard_pique carles_puyol sergio_ramos pedri gavi yamal bellingham kane
    son griezmann pogba kante muller neuer ter_stegen courtois alisson ederson ibrahimovic drogba
    salah mane figo eusebio bergkamp van_basten van_persie robben rooney gerrard lampard scholes giggs
    cantona zanetti crespo veron aguero tevez mascherano otamendi montiel
  `);

  const ESTADOS_MX = words(`
    aguascalientes baja_california baja_california_sur campeche chiapas chihuahua coahuila colima durango
    guanajuato guerrero hidalgo jalisco mexico michoacan morelos nayarit nuevo_leon oaxaca puebla queretaro
    quintana_roo san_luis_potosi sinaloa sonora tabasco tamaulipas tlaxcala veracruz yucatan zacatecas
    ciudad_de_mexico cdmx estado_de_mexico
  `);

  const CAPITALES = words(`
    amsterdam atenas bogota brasilia buenos_aires berlin bruselas budapest caracas copenhague dublin el_cairo
    helsinki la_habana lima lisboa londres madrid managua moscu montevideo nairobi oslo ottawa panama paris
    pekin praga quito rabat roma san_jose san_juan san_salvador santiago santo_domingo seul estocolmo
    tegucigalpa tokio varsovia viena washington la_paz asuncion guatemala ciudad_de_mexico berna bangkok
    nueva_delhi yakarta teheran bagdad kabul canberra wellington ankara belgrado bucarest sofia zagreb
    liubliana bratislava vilna riga tallin kiev minsk reikiavik edimburgo cardiff belfast luanda dakar
    accra abuya adis_abeba tunez argel trípoli tripoli beirut damasco amman riad doha kuwait abu_dabi
    mascate islamabad katmandu dacca colombo hanoi manila kuala_lumpur singapur pionyang taipei ulan_bator
    kingston puerto_principe belmopan la_valeta nicosia luxemburgo andorra_la_vieja
  `);

  const BEBIDAS = words(`
    coca_cola pepsi sprite fanta sidral_mundet jarritos manzanita_sol boing squirt delaware_punch mirinda
    red_bull monster gatorade powerade jumex agua cerveza tequila mezcal vino ron vodka whisky brandy
    ginebra jugo leche cafe te licuado limonada horchata jamaica tamarindo atole champurrado chocolate
    refresco soda naranjada michelada margarita mojito pina_colada cuba_libre paloma carajillo sangria
    champan sidra pulque tepache cocoa capuchino expreso latte frappe malteada smoothie kombucha
    electrolit topo_chico bonafont ciel epura santa_clara lala yakult tonic agua_mineral
  `);

  const DULCES_BOTANAS = words(`
    paleta tamarindo mazapan pulparindo rielito chamoy lucas vero_mango pelon_pelo_rico duvalin gomitas
    cacahuates cacahuates_japoneses churrumais takis sabritas doritos cheetos ruffles fritos palomitas
    chicharrones tostitos rancheritos pepinos chicles caramelos chocolates bombones paletas_de_hielo
    cocadas obleas muegano palanqueta alegria glorias jamoncillo dulce_de_leche cajeta ate tamarindos
    carlos_v kinder_sorpresa ferrero snickers m_and_ms hershey skittles gansito pinguinos marinela
    barritas mantecadas submarinos choco_roles pastelitos galletas emperador oreo marias chokis
    principe maruchan nissin cacahuate pistaches nueces almendras semillas pepitas habanero_cacahuates
  `);

  const TRANSPORTE = words(`
    carro coche auto automovil camion camioneta autobus camion bicicleta bici moto motocicleta patineta scooter
    tren metro metrobus tranvia avion avioneta helicoptero barco lancha yate velero submarino crucero
    ferry teleferico taxi uber mototaxi trolebus tractor ambulancia patrulla bomba grua trailer pipa
    globo_aerostatico cohete nave_espacial transbordador triciclo carreta carruaje caballo burro canoa
    kayak balsa trineo monopatin segway tuktuk limusina deportivo pickup van minivan
  `);

  const ROPA = words(`
    camisa playera camiseta pantalon jeans short falda vestido blusa sueter chamarra chaqueta abrigo gabardina
    calcetines calcetin zapatos tenis botas sandalias chanclas huaraches gorra sombrero gorro bufanda guantes
    cinturon corbata moño mono traje saco chaleco pijama bata calzones boxers brasier medias pantimedias
    leggins leotardo bikini traje_de_bano trusa tanga overol mandil delantal sudadera hoodie poncho rebozo
    sarape guayabera bermudas pantalon_de_mezclilla playera_polo tirantes camiseta_deportiva pants
    uniforme disfraz paliacate boina lentes anillo collar pulsera arete reloj
  `);

  const ESCUELA = words(`
    lapiz pluma boligrafo cuaderno libreta libro mochila goma sacapuntas regla compas transportador escuadra
    tijeras pegamento resistol colores crayones plumones marcadores pintura pincel acuarela plastilina
    folder carpeta engrapadora grapas clips calculadora pizarron gis borrador pupitre escritorio silla
    diccionario atlas globo_terraqueo mapa papel hoja cartulina papel_china diurex cinta_adhesiva
    corrector marcatextos post_it agenda estuche lonchera uniforme sacapunta lapicero tinta cuaderno_de_dibujo
    proyector computadora laptop tablet
  `);

  const COCINA = words(`
    estufa horno microondas refrigerador refri licuadora batidora tostador cafetera olla sarten cazuela comal
    molcajete tortillero plato vaso taza cuchara tenedor cuchillo cucharon espatula colador rallador abrelatas
    destapador tabla_de_cortar fregadero lavaplatos trapo esponja jabon sarten_antiadherente vaporera
    olla_de_presion tetera jarra jarron charola bandeja molde rodillo pinza exprimidor mortero batidor
    cuchara_de_palo servilleta mantel palillos popote canasta despensa alacena gabinete campana extractor
    freidora horno_de_microondas licuadora_de_mano procesador moledor pelapapas cortador termo
  `);

  const SUPER = words(`
    leche huevo pan tortillas arroz frijol pasta sopa atun sardinas aceite azucar sal harina cafe te galletas
    cereal jamon queso salchicha pollo carne res cerdo pescado fruta verdura jitomate cebolla papa limon
    refresco jugo agua cerveza vino papel_higienico jabon shampoo pasta_dental cepillo desodorante detergente
    suavizante cloro escoba trapeador servilletas bolsas pañales panales toallas_sanitarias croquetas
    mayonesa mostaza catsup salsa chiles_en_lata mermelada mantequilla crema yogur gelatina helado
    cacahuates chocolate dulces papas botanas avena granola lentejas garbanzo
  `);

  const FLORES = words(`
    rosa tulipan margarita girasol orquidea lirio clavel jazmin lavanda violeta amapola azucena begonia
    cempasuchil dalia nardo gardenia hortensia geranio camelia crisantemo narciso peonia petunia gladiola
    buganvilia flor_de_jamaica nochebuena alcatraz lotus loto jacaranda azalea lila malva pensamiento
    primavera gerbera fresia mirto hibisco anturio bromelia cactus nopal agave
  `);

  const AVES = words(`
    aguila halcon buho lechuza paloma gorrion canario loro perico guacamaya tucan flamenco pelicano cisne pato
    ganso gallina gallo pavo pollo avestruz pinguino colibri cuervo zopilote gaviota albatros condor buitre
    cardenal calandria jilguero zenzontle chachalaca codorniz faisan perdiz garza cigueña ciguena grulla
    ibis alcaravan carpintero quetzal tordo urraca mirlo petirrojo ruisenor golondrina vencejo cuclillo
    kiwi emu casuario cacatua periquito tortola oropendola gavilan aguilucho cernicalo milano alcon
  `);

  const INSTRUMENTOS = words(`
    guitarra piano violin viola violonchelo contrabajo arpa flauta clarinete oboe fagot saxofon trompeta
    trombon tuba corno bateria tambor timbal xilofono marimba bongo conga maracas guiro pandero triangulo
    acordeon armonica organo teclado sintetizador bajo ukelele mandolina banjo sitar cuatro charango quena
    zampona bandoneon vihuela guitarron requinto jarana cajon castanuelas campana gong cascabel flautin
    ocarina silbato kalimba theremin didgeridoo gaita
  `);

  const HERRAMIENTAS = words(`
    martillo destornillador desarmador llave pinzas alicate serrucho taladro sierra cinta_metrica metro nivel
    escuadra lima cincel formon pala pico rastrillo azadon machete hacha cuchilla navaja tijeras cortadora
    lijadora cepillo prensa tornillo clavo tuerca perno arandela broca llave_inglesa llave_allen
    soldadora pistola_de_silicon cautin multimetro escalera cubeta carretilla manguera cinta_aislante
    brocha rodillo espatula cutter pegamento candado cadena cuerda gancho taladro_electrico
  `);

  // list: palabras válidas. Cuantas más, menos injusto es el juez automático.
  const CATEGORIES = [
    { id: 'cuatro_patas', name: 'Animales de cuatro patas', level: 1, list: CUATRO_PATAS },
    { id: 'animales', name: 'Animales', level: 1, list: CUATRO_PATAS.concat(OTROS_ANIMALES) },
    { id: 'frutas', name: 'Frutas', level: 1, list: FRUTAS },
    { id: 'colores', name: 'Colores', level: 1, list: COLORES },
    { id: 'nombres_mujer', name: 'Nombres de mujer', level: 1, list: NOMBRES_MUJER },
    { id: 'nombres_hombre', name: 'Nombres de hombre', level: 1, list: NOMBRES_HOMBRE },
    { id: 'comida_mx', name: 'Comida mexicana', level: 1, list: COMIDA_MEXICANA },
    { id: 'cuerpo', name: 'Partes del cuerpo', level: 1, list: CUERPO },
    { id: 'deportes', name: 'Deportes', level: 1, list: DEPORTES },
    { id: 'simpson', name: 'Personajes de Los Simpson', level: 1, list: SIMPSON },
    { id: 'disney', name: 'Personajes de Disney y Pixar', level: 1, list: DISNEY },
    { id: 'superheroes', name: 'Superhéroes y villanos', level: 1, list: SUPERHEROES },
    { id: 'cocina', name: 'Cosas que hay en la cocina', level: 1, list: COCINA },
    { id: 'super', name: 'Cosas que compras en el súper', level: 1, list: SUPER },
    { id: 'bebidas', name: 'Bebidas', level: 1, list: BEBIDAS },
    { id: 'dulces', name: 'Dulces y botanas', level: 1, list: DULCES_BOTANAS },
    { id: 'transporte', name: 'Medios de transporte', level: 1, list: TRANSPORTE },
    { id: 'ropa', name: 'Prendas de ropa y accesorios', level: 1, list: ROPA },
    { id: 'escuela', name: 'Útiles escolares', level: 1, list: ESCUELA },
    { id: 'equipos', name: 'Equipos de fútbol', level: 1, list: FUTBOL_EQUIPOS },
    { id: 'paises', name: 'Países', level: 2, list: PAISES },
    { id: 'verduras', name: 'Verduras y hierbas', level: 2, list: VERDURAS },
    { id: 'profesiones', name: 'Profesiones', level: 2, list: PROFESIONES },
    { id: 'autos', name: 'Marcas de autos', level: 2, list: MARCAS_AUTOS },
    { id: 'peliculas', name: 'Películas', level: 2, list: PELICULAS },
    { id: 'series', name: 'Series y caricaturas', level: 2, list: SERIES },
    { id: 'cantantes', name: 'Cantantes o grupos musicales', level: 2, list: CANTANTES },
    { id: 'futbolistas', name: 'Futbolistas', level: 2, list: FUTBOLISTAS },
    { id: 'selecciones', name: 'Selecciones de fútbol', level: 2, list: SELECCIONES },
    { id: 'estados', name: 'Estados de México', level: 2, list: ESTADOS_MX },
    { id: 'pokemon', name: 'Pokémon', level: 2, list: POKEMON },
    { id: 'dragonball', name: 'Personajes de Dragon Ball', level: 2, list: DRAGON_BALL },
    { id: 'videojuegos', name: 'Videojuegos y sus personajes', level: 2, list: VIDEOJUEGOS },
    { id: 'capitales', name: 'Capitales del mundo', level: 3, list: CAPITALES },
    { id: 'aves', name: 'Aves', level: 3, list: AVES },
    { id: 'flores', name: 'Flores y plantas', level: 3, list: FLORES },
    { id: 'instrumentos', name: 'Instrumentos musicales', level: 3, list: INSTRUMENTOS },
    { id: 'herramientas', name: 'Herramientas', level: 3, list: HERRAMIENTAS },
  ];

  // Dificultad: qué temas (level) y qué letras entran, y el tiempo sugerido por turno.
  // letters: porción del ranking de letras (de la más fácil a la más rara) que se usa.
  const DIFFICULTIES = {
    facil:   { label: 'Fácil',   levels: [1],       letters: [0, 0.5],   seconds: 7 },
    medio:   { label: 'Medio',   levels: [1, 2],    letters: [0.2, 0.8], seconds: 5 },
    dificil: { label: 'Difícil', levels: [2, 3],    letters: [0.5, 1],   seconds: 4 },
    extremo: { label: 'Extremo', levels: [2, 3],    letters: [0.8, 1],   seconds: 3 },
  };

  const PUNISHMENTS = [
    'Toma un trago (o un vaso de agua)',
    'Di un trabalenguas sin equivocarte',
    'Imita a un animal hasta que el grupo se ría',
    'Cuenta un secreto vergonzoso',
    'Haz 10 sentadillas',
    'Canta el coro de una canción que elija el grupo',
    'Habla con acento de otro país por 2 rondas',
    'Deja que el grupo te escriba algo en la frente',
    'Baila 20 segundos sin música',
    'Manda un audio diciendo "te quiero" a quien elija el grupo',
  ];

  root.CCData = { LETTERS, CATEGORIES, DIFFICULTIES, PUNISHMENTS };
})(typeof self !== 'undefined' ? self : this);
