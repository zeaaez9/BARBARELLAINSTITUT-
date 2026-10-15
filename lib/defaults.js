module.exports = {
  services: [
  // Massages
  {name:'Massage Iris',cat:'massage',price:180,price30:100,dur:'1 heure',dur30:'30 min',desc:'Inspiration de la déesse de l’arc-en-ciel. Gestes fluides et précis qui apaisent le mental et détendent chaque muscle, dans une lumière douce et un silence respectueux. Un soin de détente pure, au service de votre bien-être.'},
  {name:'Massage Arthemis',cat:'massage',price:220,price30:130,dur:'1 heure',dur30:'30 min',desc:'Force et grâce. Un rituel plus soutenu, conçu pour libérer les tensions profondes et restaurer une sensation de légèreté durable. Soin expert, présence attentive.'},
  {name:'Massage Aphrodisiaque',cat:'massage',price:250,price30:150,dur:'1 heure',dur30:'30 min',desc:'Huiles chaudes, rythme lent, atmosphère feutrée. Un voyage sensoriel qui éveille les sens avec délicatesse — sensualité raffinée, ancrée dans le soin et le respect.'},
  {name:'Massage pour le couple',cat:'massage',price:280,price30:null,dur:'1 heure',dur30:null,desc:'Deux présences, un même espace. Une parenthèse partagée, synchronisée, pour se reconnecter dans un cadre intime, élégant et bienveillant. Connexion et soin, côte à côte.'},
  {name:'Massage Ventouse',cat:'massage',price:120,price30:null,dur:'Séance',dur30:null,desc:'Technique ancestrale revisitée. Les ventouses détendent les tissus, stimulent la circulation et offrent une sensation de renouveau. Un soin corps en profondeur.'},
  {name:'Massage Appareil',cat:'massage',price:90,price30:null,dur:'Séance',dur30:null,desc:'Précision et constance. Un soin assisté par appareil, idéal pour cibler les zones de tension avec douceur et efficacité.'},
  {name:'Massage à la demande',cat:'massage',price:0,price30:null,dur:'Sur mesure',dur30:null,desc:'Une expérience composée selon vos envies du moment — entre sensualité feutrée et soin profond. Durée, intensité et rituel s’adaptent à vous, dans la discrétion et l’élégance de l’Institut.'},
  // Épilation cire orientale — tarifs alignés marché Paris 2026
  {name:'Épilation lèvres',cat:'epilation',price:10,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — lèvres. Soin précis et discret.'},
  {name:'Épilation menton',cat:'epilation',price:10,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — menton. Résultat net et soigné.'},
  {name:'Épilation sourcils',cat:'epilation',price:15,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — sourcils. Dessin précis et harmonieux.'},
  {name:'Épilation visage',cat:'epilation',price:25,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — visage complet. Peau douce et nette.'},
  {name:'Épilation avant-bras',cat:'epilation',price:18,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — avant-bras.'},
  {name:'Épilation bras',cat:'epilation',price:28,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — bras complets.'},
  {name:'Épilation aisselles',cat:'epilation',price:15,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — aisselles. Confort et précision.'},
  {name:'Épilation demi-jambes',cat:'epilation',price:22,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — demi-jambes.'},
  {name:'Épilation jambes',cat:'epilation',price:38,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — jambes complètes.'},
  {name:'Épilation dos',cat:'epilation',price:45,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — dos. Soin complet et minutieux.'},
  {name:'Épilation torse',cat:'epilation',price:35,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — torse.'},
  {name:'Épilation maillot simple',cat:'epilation',price:28,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — maillot simple. Discrétion et confort.'},
  {name:'Épilation maillot intégral',cat:'epilation',price:42,price30:null,dur:'Séance',dur30:null,desc:'Épilation à la cire orientale — maillot intégral. Soin complet, réalisé avec minutie et discrétion.'},
  // Manucure & Pédicure — tarifs marché Paris (visibles seulement si catégorie activée)
  {name:'Manucure simple',cat:'manucure',price:35,price30:null,dur:'30 min',dur30:null,desc:'Soin des mains, limage, cuticules et hydratation. Sans vernis.'},
  {name:'Manucure + vernis classique',cat:'manucure',price:45,price30:null,dur:'40 min',dur30:null,desc:'Manucure complète + pose de vernis classique.'},
  {name:'Manucure + semi-permanent',cat:'manucure',price:55,price30:null,dur:'50 min',dur30:null,desc:'Manucure complète + vernis semi-permanent. Tenue 2 à 3 semaines.'},
  {name:'Pédicure simple',cat:'manucure',price:45,price30:null,dur:'40 min',dur30:null,desc:'Soin des pieds, gommage, cuticules et hydratation. Sans vernis.'},
  {name:'Pédicure + vernis classique',cat:'manucure',price:55,price30:null,dur:'50 min',dur30:null,desc:'Pédicure complète + pose de vernis classique.'},
  {name:'Pédicure + semi-permanent',cat:'manucure',price:65,price30:null,dur:'1 heure',dur30:null,desc:'Pédicure complète + vernis semi-permanent. Tenue longue durée.'},
  {name:'Forfait Mani + Pédi',cat:'manucure',price:90,price30:null,dur:'1 h 20',dur30:null,desc:'Manucure et pédicure combinées. Idéal pour un moment complet.'},
  // Produits dérivés — boutique (masquée tant que la catégorie n’est pas activée)
  {name:'Huile de massage signature',cat:'produits',price:38,price30:null,dur:'Flacon 100 ml',dur30:null,desc:'Huile soyeuse aux notes chaudes et enveloppantes. Prolonge le soin à la maison — texture sensorielle, absorption douce, cadre bien-être et sensualité raffinée.'},
  {name:'Huiles essentielles (synergie)',cat:'produits',price:28,price30:null,dur:'Flacon 10 ml',dur30:null,desc:'Synergie d’huiles essentielles pour diffusion ou rituel. Atmosphère feutrée, respiration apaisée, esprit soin.'},
  {name:'Bougie parfumée Institut',cat:'produits',price:32,price30:null,dur:'180 g',dur30:null,desc:'Bougie artisanale, cire propre, sillage discret et élégant. Lumière basse, ambiance sensorielle — le prolongement de l’Institut chez soi.'},
  {name:'Savon noir maison',cat:'produits',price:14,price30:null,dur:'125 g',dur30:null,desc:'Savon noir traditionnel, gommage doux et peau satinée. Rituel corps ancré dans le soin, texture sensorielle et respect de la peau.'},
  {name:'Cire orientale maison',cat:'produits',price:22,price30:null,dur:'Pot 200 g',dur30:null,desc:'Cire à usage professionnel ou domestique soigné, formulée dans l’esprit de nos épilations. Efficacité et confort de la cire orientale.'},
  {name:'Diffuseur d’huiles essentielles',cat:'produits',price:49,price30:null,dur:'Appareil',dur30:null,desc:'Diffuseur discret et élégant pour huiles essentielles. Brume légère, lumière douce — recrée l’atmosphère de l’Institut dans votre intérieur.'}
],
  team: [
  {id:1,name:'Déesse Farah',role:'Direction & Rituels d’exception',desc:'Présence magnétique, gestes d’une précision rare. Elle incarne l’esprit de l’Institut et compose les expériences Signature.',photo:'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop',visible:true},
  {id:2,name:'Fabuleuse Aleksandra',role:'Art du toucher & Couple',desc:'Élégance, intensité douce. Spécialiste des rituels Aphrodisiaque et des moments à deux.',photo:'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop',visible:true},
  {id:3,name:'Sabrina',role:'Douceur & Huiles chaudes',desc:'Une présence délicate, des gestes qui enveloppent. Spécialiste Iris et détente profonde.',photo:'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=800&auto=format&fit=crop',visible:true}
],
  categoriesEnabled: { massage: true, epilation: true, manucure: true, produits: true },
  news: [{ id: 1, title: 'Carte complète', text: 'Découvrez les prestations de l’Institut Barbarella.' }],
  promo: null,
  waLinks: { a: 'https://wa.me/33667643615', b: '', c: '' }
};
