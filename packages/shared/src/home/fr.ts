import type { HomeTexts } from '../home.js';
import { RETENTION_DAYS } from '../limits.js';

export const HOME: HomeTexts = {
  'home.lead':
    'Quand est-ce que tout le monde est dispo ? Indiquez vos jours dans le calendrier et trouvez la bonne date. Sans compte ni suivi.',
  'home.feature.heat.title': 'Voyez les dates qui conviennent',
  'home.feature.heat.text':
    'Le calendrier devient une carte de chaleur et montre les jours où le plus de monde est disponible. Ça marche aussi pour les week-ends et les tournois sur plusieurs jours.',
  'home.feature.private.title': 'Pas de compte',
  'home.feature.private.text':
    'Un nom suffit. Pas d’adresse e-mail, de cookies ni de suivi. Les anciens événements sont supprimés automatiquement.',
  'home.faq.title': 'Questions',
  'home.faq.free.q': 'Est-ce payant ?',
  'home.faq.free.a':
    'Non. Owl Be There est gratuit et open source, et chacun peut l’installer sur son propre serveur.',
  'home.faq.account.q': 'Faut-il un compte ?',
  'home.faq.account.a':
    'Non. Chacun choisit simplement un nom. La personne qui organise reçoit un lien privé pour gérer l’événement.',
  'home.faq.doodle.q': 'Quelle différence avec Doodle ?',
  'home.faq.doodle.a':
    'Owl Be There est fait pour des journées entières : chacun marque les jours où il est libre, et la carte de chaleur montre d’un coup d’œil le meilleur jour. Pas de compte, pas de suivi, et les anciens événements sont supprimés automatiquement.',
  'home.faq.days.q': 'Peut-on chercher un week-end entier ?',
  'home.faq.days.a':
    'Oui. Demandez deux jours ou plus d’affilée, et Owl Be There classe les créneaux où le plus de monde est disponible, avec un nombre minimum de participants si besoin.',
  'home.faq.messenger.q': 'Comment inviter le groupe ?',
  'home.faq.messenger.a':
    'Envoyez le lien dans le chat du groupe ou montrez le QR code. WhatsApp, Signal et les autres messageries affichent un aperçu avec le titre et les jours proposés. Personne n’a rien à installer.',
  'home.faq.privacy.q': 'Que deviennent nos données ?',
  'home.faq.privacy.a': `Seuls les noms et les jours que vous indiquez sont enregistrés : pas d’adresse e-mail, pas d’adresse IP, pas de cookies. Les événements se suppriment d’eux-mêmes, en général ${RETENTION_DAYS} jours après la dernière modification.`,
};
