// Ελληνικά. Keys are the English text exactly as the game shows it.
const dict = {
  // Screens and sign-in
  'Loading Commons…': 'Φόρτωση του Commons…', 'Loading your city…': 'Φόρτωση της πόλης σας…', 'Try again': 'Δοκιμάστε ξανά', 'Go to the public world': 'Στον δημόσιο κόσμο', 'Sign out': 'Αποσύνδεση',
  "Build a city on a shared map, right next to everyone else's. Keep it running, or watch it fall.": 'Χτίστε μια πόλη σε έναν κοινό χάρτη, δίπλα σε όλους τους άλλους. Κρατήστε τη ζωντανή ή δείτε την να καταρρέει.',
  'Sign in': 'Σύνδεση', 'Create account': 'Δημιουργία λογαριασμού', 'Email': 'Email', 'Password': 'Κωδικός', 'Forgot your password?': 'Ξεχάσατε τον κωδικό;',
  'Continue with Google': 'Συνέχεια με Google', 'Play as a guest': 'Παίξτε ως επισκέπτης', 'or': 'ή', 'Account': 'Λογαριασμός',
  'Guest cities live on this device. You can turn a guest into a full account later and keep your city.': 'Οι πόλεις επισκεπτών ζουν σε αυτή τη συσκευή. Μπορείτε αργότερα να φτιάξετε λογαριασμό και να κρατήσετε την πόλη σας.',
  'Type your email address above first, then press this again.': 'Γράψτε πρώτα το email σας παραπάνω και πατήστε ξανά.',
  'Found your city': 'Ιδρύστε την πόλη σας', "You'll get a plot on the frontier of": 'Θα πάρετε ένα οικόπεδο στα σύνορα του', 'the public world': 'δημόσιου κόσμου',
  ', with a town hall, three builders and three settlers.': ', με δημαρχείο, τρεις οικοδόμους και τρεις αποίκους.',
  'Your name as mayor': 'Το όνομά σας ως δήμαρχος', 'City name': 'Όνομα πόλης', 'Claim my plot': 'Διεκδικώ το οικόπεδό μου', 'Invite code from a friend': 'Κωδικός πρόσκλησης από φίλο',
  'Join': 'Είσοδος', 'Join a friend’s private world': 'Μπείτε στον ιδιωτικό κόσμο ενός φίλου', 'Play in the public world instead': 'Παίξτε στον δημόσιο κόσμο', 'Use a different account': 'Άλλος λογαριασμός',
  // Top bar and HUD
  'Live': 'Ζωντανά', 'Saved': 'Σώθηκε', 'Saving': 'Αποθήκευση', 'Not saved': 'Δεν αποθηκεύτηκε', 'Your city saves automatically': 'Η πόλη σας αποθηκεύεται αυτόματα',
  'Rename your city': 'Μετονομασία πόλης', 'idle': 'αδρανείς', 'Mood': 'Διάθεση', 'Demand': 'Ζήτηση', 'Read me a city summary': 'Διάβασέ μου μια σύνοψη της πόλης',
  'Thriving': 'Ακμάζει', 'Content': 'Ικανοποιημένη', 'Uneasy': 'Ανήσυχη', 'Unhappy': 'Δυσαρεστημένη', 'Fallen': 'Κατέρρευσε',
  'Village': 'Χωριό', 'Town': 'Κωμόπολη', 'City': 'Πόλη', 'Metropolis': 'Μητρόπολη',
  '3D view (V)': 'Τρισδιάστατη προβολή (V)', '2D view (V)': 'Δισδιάστατη προβολή (V)', 'Info views': 'Προβολές πληροφοριών', 'Info views: traffic, mood, services, noise (T)': 'Προβολές: κίνηση, διάθεση, υπηρεσίες, θόρυβος (T)',
  'My plot (H)': 'Το οικόπεδό μου (H)', 'Go to my plot': 'Στο οικόπεδό μου', 'Whole map (0)': 'Όλος ο χάρτης (0)', 'Show the whole map': 'Δείξε όλο τον χάρτη',
  'Leaderboards (L)': 'Κατατάξεις (L)', 'Leaderboards': 'Κατατάξεις', 'Settings (,)': 'Ρυθμίσεις (,)', 'Settings': 'Ρυθμίσεις', 'How to play (?)': 'Πώς παίζεται (?)', 'How to play': 'Πώς παίζεται',
  'Undo last placement (Ctrl+Z)': 'Αναίρεση (Ctrl+Z)', 'Undo last placement': 'Αναίρεση',
  // Needs
  'Jobs': 'Δουλειές', 'Room to grow': 'Χώρος για νέους', 'Food': 'Τρόφιμα', 'School': 'Σχολείο', 'Health': 'Υγεία', 'Safety': 'Ασφάλεια', 'Commute': 'Μετακινήσεις', 'Fun': 'Διασκέδαση',
  'Rubbish and drains': 'Σκουπίδια και αποχέτευση', 'Clean air': 'Καθαρός αέρας', 'Power and water': 'Ρεύμα και νερό', 'Homes': 'Κατοικίες', 'Shops': 'Καταστήματα', 'Services': 'Υπηρεσίες',
  // Rail and panels
  'Goals': 'Στόχοι', 'Goals (O)': 'Στόχοι (O)', 'People': 'Κάτοικοι', 'People (P)': 'Κάτοικοι (P)', 'Stats': 'Στατιστικά', 'City stats (C)': 'Στατιστικά πόλης (C)', 'City stats': 'Στατιστικά πόλης',
  'News': 'Νέα', 'News (N)': 'Νέα (N)', 'Chat': 'Συνομιλία', 'Chat (K)': 'Συνομιλία (K)', 'World': 'Κόσμος', 'World (J)': 'Κόσμος (J)', 'Region': 'Περιφέρεια', 'Region: projects and alliances (Y)': 'Περιφέρεια: έργα και συμμαχίες (Y)',
  'Close panel': 'Κλείσιμο', 'Close': 'Κλείσιμο', 'Close details': 'Κλείσιμο', '← All people': '← Όλοι οι κάτοικοι',
  'Overview': 'Επισκόπηση', 'Budget': 'Προϋπολογισμός', 'Policy': 'Πολιτική', 'Research': 'Έρευνα', 'History': 'Ιστορικό',
  'Headlines': 'Πρωτοσέλιδο', 'Everything': 'Όλα', 'Latest': 'Τελευταία',
  "Today’s challenge": 'Η σημερινή πρόκληση', 'Requests from residents': 'Αιτήματα κατοίκων', 'This week’s world challenge': 'Η εβδομαδιαία πρόκληση του κόσμου',
  'Neighbours': 'Γείτονες', 'Between cities': 'Ανάμεσα σε πόλεις', 'Your worlds': 'Οι κόσμοι σας', 'Ruins you could move to': 'Ερείπια για νέα αρχή', 'Your guestbook': 'Το βιβλίο επισκεπτών σας', 'Guestbook': 'Βιβλίο επισκεπτών', 'Around the world': 'Στον κόσμο',
  'Start a private world': 'Νέος ιδιωτικός κόσμος', 'Join with a code': 'Είσοδος με κωδικό', 'Create': 'Δημιουργία', 'Invite code': 'Κωδικός πρόσκλησης', 'Copy code': 'Αντιγραφή κωδικού', 'Share link': 'Κοινοποίηση συνδέσμου',
  'Regional projects': 'Περιφερειακά έργα', 'Alliances': 'Συμμαχίες', 'Alliance chat': 'Συνομιλία συμμαχίας', 'Start a project': 'Νέο έργο', 'Start': 'Έναρξη', 'Found an alliance': 'Ιδρύστε συμμαχία', 'Found': 'Ίδρυση',
  'Leave the alliance': 'Αποχώρηση από τη συμμαχία', 'Close the alliance': 'Κλείσιμο συμμαχίας', 'Founder': 'Ιδρυτής', 'Alliances by population': 'Συμμαχίες κατά πληθυσμό',
  'Send': 'Αποστολή', 'Sign': 'Υπογραφή', 'Leave a note': 'Αφήστε ένα σημείωμα', 'Block': 'Αποκλεισμός', 'Report': 'Αναφορά', 'Send a gift': 'Στείλτε δώρο',
  'Everyone in this world can read these. Be kind.': 'Όλοι σε αυτόν τον κόσμο τα διαβάζουν. Να είστε ευγενικοί.',
  // Modes and building
  'Build': 'Χτίσιμο', 'Build (B)': 'Χτίσιμο (B)', 'Select': 'Επιλογή', 'Select (E)': 'Επιλογή (E)', 'Move': 'Μετακίνηση', 'Move (R)': 'Μετακίνηση (R)',
  'Clear': 'Κατεδάφιση', 'Lights': 'Φανάρια', 'Unzone': 'Χωρίς ζώνη', 'Cancel': 'Άκυρο', 'Demolish': 'Κατεδάφιση', 'Help build': 'Βοηθήστε στο χτίσιμο',
  'Search buildings': 'Αναζήτηση κτιρίων', 'Only what I can build now': 'Μόνο όσα μπορώ να χτίσω τώρα', 'All': 'Όλα', 'Work and shops': 'Δουλειά και καταστήματα', 'Education': 'Εκπαίδευση',
  'Health and safety': 'Υγεία και ασφάλεια', 'Leisure and sport': 'Αναψυχή και αθλητισμός', 'Transport': 'Μεταφορές', 'Utilities': 'Υποδομές',
  'Top level reached.': 'Έφτασε στο ανώτατο επίπεδο.', 'Condition': 'Κατάσταση', 'Staff': 'Προσωπικό', 'Residents': 'Κάτοικοι', 'Pupils': 'Μαθητές', 'Historic': 'Ιστορικό', 'Protect it': 'Προστατέψτε το', 'Lift protection': 'Άρση προστασίας',
  'Empty land': 'Άδεια γη', 'Water': 'Νερό', 'Hillside': 'Πλαγιά', 'Land for sale': 'Γη προς πώληση', 'Unclaimed land': 'Αδιεκδίκητη γη', 'Active now': 'Ενεργή τώρα',
  // Buildings
  'Road': 'Δρόμος', 'Footpath': 'Μονοπάτι', 'Level crossing': 'Ισόπεδη διάβαση', 'Traffic lights': 'Φανάρια', 'Roundabout': 'Κυκλικός κόμβος', 'Power station': 'Σταθμός ηλεκτροπαραγωγής',
  'Water tower': 'Υδατόπυργος', 'Storm drains': 'Αντιπλημμυρικοί αγωγοί', 'Railway': 'Ράγες', 'Bus stop': 'Στάση λεωφορείου', 'Bus depot': 'Αμαξοστάσιο', 'Train station': 'Σιδηροδρομικός σταθμός',
  'House': 'Σπίτι', 'Apartments': 'Πολυκατοικία', 'Villa': 'Βίλα', 'Office': 'Γραφεία', 'Grocer': 'Μπακάλικο', 'Café': 'Καφετέρια', 'Factory': 'Εργοστάσιο', "Builder's yard": 'Αποθήκη οικοδόμων',
  'Daycare': 'Παιδικός σταθμός', 'Primary school': 'Δημοτικό σχολείο', 'High school': 'Λύκειο', 'University': 'Πανεπιστήμιο', 'Tutoring centre': 'Φροντιστήριο', 'Library': 'Βιβλιοθήκη',
  'Clinic': 'Ιατρείο', 'Hospital': 'Νοσοκομείο', 'Police station': 'Αστυνομικό τμήμα', 'Fire station': 'Πυροσβεστικός σταθμός', 'Courthouse': 'Δικαστήριο', 'Cemetery': 'Νεκροταφείο',
  'Park': 'Πάρκο', 'Playground': 'Παιδική χαρά', 'Sports field': 'Γήπεδο', 'Gym': 'Γυμναστήριο', 'Martial arts dojo': 'Σχολή πολεμικών τεχνών', 'Swimming pool': 'Πισίνα', 'Cinema': 'Κινηματογράφος',
  'Town hall': 'Δημαρχείο', 'Rubble': 'Μπάζα', 'Solar farm': 'Φωτοβολταϊκό πάρκο', 'Wind turbine': 'Ανεμογεννήτρια', 'Museum': 'Μουσείο', 'Stadium': 'Στάδιο', 'Hotel': 'Ξενοδοχείο', 'Urban farm': 'Αστικό αγρόκτημα',
  'Harbour': 'Λιμάνι', 'Airport': 'Αεροδρόμιο', 'Landfill': 'Χωματερή', 'Recycling centre': 'Κέντρο ανακύκλωσης', 'Sewage works': 'Βιολογικός καθαρισμός', 'Vet': 'Κτηνίατρος', 'Metro station': 'Σταθμός μετρό', 'Monument': 'Μνημείο',
  'Homes zone': 'Ζώνη κατοικιών', 'Shops zone': 'Ζώνη καταστημάτων', 'Industry zone': 'Βιομηχανική ζώνη',
  // Residents
  'Character': 'Χαρακτήρας', 'Pet': 'Κατοικίδιο', 'Education ': 'Εκπαίδευση', 'Easy-going': 'Χαλαρός', 'Sporty': 'Αθλητικός', 'Bookish': 'Βιβλιοφάγος', 'Night owl': 'Νυχτοπούλι', 'Homebody': 'Σπιτόγατος', 'Nature lover': 'Λάτρης της φύσης',
  'No schooling': 'Χωρίς σχολείο', 'Primary': 'Δημοτικό', 'Degree': 'Πτυχίο',
  // Council cards and letters
  'Council decision': 'Απόφαση δημοτικού συμβουλίου', 'A letter to the mayor': 'Επιστολή προς τον δήμαρχο', 'Promise to fix it': 'Υπόσχομαι να το φτιάξω', 'Thank them': 'Ευχαριστήστε τους',
  // Settings
  'Display': 'Εμφάνιση', 'Colours': 'Χρώματα', 'Interface': 'Διεπαφή', 'Sound': 'Ήχος', 'Keys': 'Πλήκτρα', 'Theme': 'Θέμα', 'Auto': 'Αυτόματο', 'Light': 'Φωτεινό', 'Dark': 'Σκοτεινό', 'View': 'Προβολή',
  'People on screen': 'Κάτοικοι στην οθόνη', 'Fewer': 'Λιγότεροι', 'Everyone': 'Όλοι', 'Show people moving around': 'Δείξε τους κατοίκους να κινούνται', 'Day and night': 'Μέρα και νύχτα', 'Tile grid': 'Πλέγμα',
  'Floating numbers': 'Αιωρούμενοι αριθμοί', 'Reduce motion': 'Λιγότερη κίνηση', 'Text and interface size': 'Μέγεθος κειμένου και διεπαφής', 'Normal': 'Κανονικό', 'Large': 'Μεγάλο', 'Larger': 'Μεγαλύτερο', 'Largest': 'Πολύ μεγάλο',
  'Font': 'Γραμματοσειρά', 'Standard': 'Κανονική', 'Easy to read': 'Ευανάγνωστη', 'Notifications': 'Ειδοποιήσεις', 'Warnings': 'Προειδοποιήσεις', 'Off': 'Όχι', 'On phones': 'Στα κινητά', 'Right thumb': 'Δεξί χέρι', 'Left thumb': 'Αριστερό χέρι',
  'Compact layout': 'Συμπαγής διάταξη', 'Simple mode': 'Απλή λειτουργία', 'Minimap': 'Μικρός χάρτης', 'Language': 'Γλώσσα', 'Feedback': 'Σχόλια', 'Send feedback': 'Στείλτε σχόλια', 'Photo mode': 'Λειτουργία φωτογραφίας',
  'Music': 'Μουσική', 'Music volume': 'Ένταση μουσικής', 'Sound effects': 'Ηχητικά εφέ', 'City sounds': 'Ήχοι πόλης', 'Effects volume': 'Ένταση εφέ', 'City sounds volume': 'Ένταση ήχων πόλης', 'Quiet in the background': 'Σίγαση στο παρασκήνιο', 'Vibrate on phones': 'Δόνηση στα κινητά',
  'Settings are saved on this device.': 'Οι ρυθμίσεις αποθηκεύονται σε αυτή τη συσκευή.', 'Change': 'Αλλαγή', 'Back to the usual keys': 'Επαναφορά πλήκτρων', 'Blocked players': 'Αποκλεισμένοι παίκτες',
  // Account
  'Profile': 'Προφίλ', 'Achievements': 'Επιτεύγματα', 'Mayor name': 'Όνομα δημάρχου', 'Save': 'Αποθήκευση', 'Download a copy of my city': 'Κατεβάστε ένα αντίγραφο της πόλης μου', 'Delete account': 'Διαγραφή λογαριασμού', 'Delete my account': 'Διαγραφή του λογαριασμού μου',
  // Help and modals
  'What’s new': 'Τι νέο υπάρχει', 'Questions and support': 'Ερωτήσεις και υποστήριξη', 'Take the interactive tour': 'Κάντε τη διαδραστική περιήγηση', 'Restart the tour': 'Ξεκινήστε ξανά την περιήγηση',
  'Not now': 'Όχι τώρα', 'Keep it': 'Κρατήστε το', 'Back to the city': 'Πίσω στην πόλη', 'Save picture': 'Αποθήκευση εικόνας', 'Done': 'Τέλος', 'Stop': 'Διακοπή', 'Pause': 'Παύση', 'Play': 'Αναπαραγωγή',
  'Slow': 'Αργά', 'Fast': 'Γρήγορα', 'Save as video': 'Αποθήκευση ως βίντεο', 'Watch your city grow': 'Δείτε την πόλη σας να μεγαλώνει', 'Undo history': 'Ιστορικό αναιρέσεων', 'Undo to here': 'Αναίρεση ως εδώ',
  'Biggest ever': 'Η μεγαλύτερη όλων', 'Longest running': 'Η μακροβιότερη', 'Fallen cities': 'Πόλεις που έπεσαν', 'Happiest': 'Η πιο ευτυχισμένη', 'Greenest': 'Η πιο πράσινη', 'Best transit': 'Καλύτερες συγκοινωνίες',
  'Richest': 'Η πλουσιότερη', 'Tourist magnets': 'Τουριστικοί πόλοι', 'Fastest growing this month': 'Η ταχύτερη ανάπτυξη αυτόν τον μήνα', 'Hall of fame': 'Πάνθεον', 'No cities yet.': 'Δεν υπάρχουν ακόμη πόλεις.',
  'Traffic': 'Κίνηση', 'Noise': 'Θόρυβος', 'Land value': 'Αξία γης', 'Turn off': 'Απενεργοποίηση',
  // Stats
  'Income': 'Έσοδα', 'Upkeep': 'Συντήρηση', 'Daily balance': 'Ημερήσιο ισοζύγιο', 'Next 7 days': 'Επόμενες 7 ημέρες', 'Bank': 'Τράπεζα', 'City bonds': 'Δημοτικά ομόλογα', 'Tax rate': 'Φορολογικός συντελεστής',
  'Service funding': 'Χρηματοδότηση υπηρεσιών', 'Property tax': 'Φόρος ακινήτων', 'Environment': 'Περιβάλλον', 'Air quality': 'Ποιότητα αέρα', 'Clean power': 'Καθαρή ενέργεια',
  'Free buses and trains': 'Δωρεάν λεωφορεία και τρένα', 'Congestion charge': 'Τέλος κυκλοφοριακής συμφόρησης', 'Carbon tax': 'Φόρος άνθρακα', 'Disaster insurance': 'Ασφάλιση καταστροφών', 'Low': 'Χαμηλός', 'High': 'Υψηλός',
  'Population': 'Πληθυσμός', 'Money': 'Χρήματα', 'Research points': 'Πόντοι έρευνας', 'Earned yesterday': 'Κέρδος χθες', 'Tourism': 'Τουρισμός', 'Pensions': 'Συντάξεις',
  // Seasons and weather
  'Spring': 'Άνοιξη', 'Summer': 'Καλοκαίρι', 'Autumn': 'Φθινόπωρο', 'Winter': 'Χειμώνας', 'clear': 'αίθριος', 'rain': 'βροχή', 'snow': 'χιόνι', 'heat': 'καύσωνας',
};

const SEASON = { Spring: 'Άνοιξη', Summer: 'Καλοκαίρι', Autumn: 'Φθινόπωρο', Winter: 'Χειμώνας' };
// The path, exchange and city shares (1.17)
Object.assign(dict, {
  'Not yet': 'Όχι ακόμα', 'See your path': 'Δείτε την πορεία σας', 'See the next chapter': 'Δείτε το επόμενο κεφάλαιο', 'Keep playing': 'Συνεχίστε',
  'Why it matters:': 'Γιατί έχει σημασία:', 'Exchange': 'Χρηματιστήριο', 'Cities': 'Πόλεις', 'Price': 'Τιμή', 'Today': 'Σήμερα', 'You have': 'Έχετε',
  'Buy 50': 'Αγορά 50', 'Sell 50': 'Πώληση 50', 'List my city': 'Εισαγωγή της πόλης μου', 'Your city on the exchange': 'Η πόλη σας στο χρηματιστήριο',
  'Take it off the exchange': 'Απόσυρση από το χρηματιστήριο', 'Settle in': 'Εγκατάσταση', 'Feed yourselves': 'Τροφή για όλους', 'Power up': 'Ενέργεια',
  'Open for trade': 'Ανοιχτοί στο εμπόριο', 'Invest and ally': 'Επενδύσεις και συμμαχίες', 'Build a council': 'Χτίστε δήμο', 'Metropolis': 'Μητρόπολη',
  'Your resources': 'Οι πόροι σας', 'Your path': 'Η πορεία σας',
});
// Shares and rankings (1.16)
Object.assign(dict, {
  'Shares': 'Μετοχές', 'Your shares are worth': 'Οι μετοχές σας αξίζουν', 'You paid': 'Πληρώσατε', 'Buy 10': 'Αγορά 10', 'Sell all': 'Πώληση όλων',
  'Alliance rankings': 'Κατάταξη συμμαχιών', 'Growth this month': 'Ανάπτυξη αυτόν τον μήνα', 'Population': 'Πληθυσμός',
  'Trade food and materials with other cities, lend or borrow money, and buy shares.': 'Ανταλλάξτε τρόφιμα και υλικά με άλλες πόλεις, δανείστε ή δανειστείτε χρήματα, και αγοράστε μετοχές.',
});
// The free 3D camera (1.15)
Object.assign(dict, {
  'Free': 'Ελεύθερη', 'Loading the 3D view…': 'Φόρτωση της τρισδιάστατης προβολής…', 'Free 3D camera': 'Ελεύθερη τρισδιάστατη κάμερα',
  'Free camera: turn, tilt and zoom in real 3D (3)': 'Ελεύθερη κάμερα: περιστροφή, κλίση και ζουμ σε πραγματικό 3D (3)',
});
// Resources on show and harvests (1.14)
Object.assign(dict, {
  'Makes a day': 'Παράγει ημερησίως', 'Harvest': 'Σοδειά', 'Collect the harvest': 'Μαζέψτε τη σοδειά', 'Uses a day': 'Καταναλώνει ημερησίως', 'Stores': 'Αποθηκεύει',
  'Needs each day': 'Χρειάζεται ημερησίως', 'Contract': 'Σύμβαση', 'Nothing until it has staff': 'Τίποτα μέχρι να έχει προσωπικό',
  'Builds up a harvest while it works. Tap it to collect.': 'Μαζεύει σοδειά όσο δουλεύει. Πατήστε το για να τη μαζέψετε.',
});
// The market (1.13)
Object.assign(dict, {
  'Market': 'Αγορά', 'Offers': 'Προσφορές', 'Post': 'Δημοσίευση', 'Yours': 'Δικές σας', 'Withdraw': 'Απόσυρση', 'I want to': 'Θέλω να',
  'Sell': 'Πουλήσω', 'Buy': 'Αγοράσω', 'Borrow money': 'Δανειστώ χρήματα', 'What': 'Τι', 'How many': 'Πόσα', 'Price each': 'Τιμή ανά μονάδα',
  'Amount': 'Ποσό', 'Repay': 'Αποπληρωμή', 'Within (days)': 'Μέσα σε (ημέρες)', 'Post the offer': 'Δημοσίευση προσφοράς',
  'Your open offers': 'Οι ανοιχτές προσφορές σας', 'You owe': 'Οφείλετε', 'Owed to you': 'Σας οφείλουν', 'Nothing.': 'Τίποτα.', 'None.': 'Καμία.',
  'Trade food and materials with other cities, and lend or borrow money.': 'Ανταλλάξτε τρόφιμα και υλικά με άλλες πόλεις, και δανείστε ή δανειστείτε χρήματα.',
  'Your offer is on the market.': 'Η προσφορά σας είναι στην αγορά.',
  'Offer workers': 'Προσφέρω εργάτες', 'Workers': 'Εργάτες', 'With at least': 'Με τουλάχιστον', 'Fee a day, each': 'Αμοιβή ημερησίως, ανά άτομο', 'For (days)': 'Για (ημέρες)',
  'Messages': 'Μηνύματα', 'Private messages': 'Προσωπικά μηνύματα', 'All messages': 'Όλα τα μηνύματα', 'Back to world chat': 'Πίσω στη γενική συζήτηση', 'Message': 'Μήνυμα',
  'Say hello. Only the two of you can read this.': 'Πείτε ένα γεια. Μόνο εσείς οι δύο μπορείτε να το διαβάσετε.',
});
// Resources and the technology tree (1.12)
Object.assign(dict, {
  'Resources': 'Πόροι', 'Resource': 'Πόρος', 'In store': 'Σε απόθεμα', 'Made': 'Παραγωγή', 'Used': 'Κατανάλωση',
  'Water': 'Νερό', 'Power': 'Ρεύμα', 'Vegetables': 'Λαχανικά', 'Fruit': 'Φρούτα', 'Dairy': 'Γαλακτοκομικά', 'Meat': 'Κρέας',
  'Building materials': 'Οικοδομικά υλικά', 'All food': 'Όλα τα τρόφιμα', 'Home-grown': 'Ντόπια', 'Kinds of food': 'Είδη τροφίμων',
  'Food bought in yesterday': 'Εισαγωγές τροφίμων χθες', 'Surplus sold yesterday': 'Πλεόνασμα που πουλήθηκε χθες',
  'Orchard': 'Οπωρώνας', 'Dairy farm': 'Γαλακτοκομική φάρμα', 'Ranch': 'Ράντσο', 'Materials works': 'Εργοστάσιο υλικών', 'Warehouse': 'Αποθήκη',
  'Farming': 'Γεωργία', 'Industry': 'Βιομηχανία', 'Energy and transport': 'Ενέργεια και μεταφορές', 'Society': 'Κοινωνία',
  'Orchards': 'Οπωρώνες', 'Dairy farming': 'Γαλακτοκομία', 'Ranching': 'Κτηνοτροφία', 'Logistics': 'Εφοδιαστική', 'Vertical farming': 'Κάθετη καλλιέργεια',
  'Figures appear after the first day.': 'Τα στοιχεία εμφανίζονται μετά την πρώτη ημέρα.',
});
// Councils, friends and co-mayors (1.11)
Object.assign(dict, {
  'Cities': 'Πόλεις', 'Friends': 'Φίλοι', 'Open': 'Άνοιγμα', 'Step down': 'Παραίτηση', 'Co': 'Συν', 'Remove co': 'Αφαίρεση συνδημάρχου', 'Remove': 'Αφαίρεση',
  'Co-mayor here': 'Συνδήμαρχος εδώ', 'Take the desk': 'Πάρτε το γραφείο', 'Unclaimed land': 'Αδιεκδίκητη γη', 'Price': 'Τιμή',
  'Your cities here': 'Οι πόλεις σας εδώ', 'New city’s name': 'Όνομα νέας πόλης', "New city's name": 'Όνομα νέας πόλης', 'The world': 'Ο κόσμος', 'Classic world': 'Κλασικός κόσμος',
  'Start playing': 'Ξεκινήστε να παίζετε', 'Available once they’ve been idle for two minutes': 'Διαθέσιμο όταν μείνουν ανενεργοί για δύο λεπτά',
});
// Interface layout (1.10)
Object.assign(dict, {
  'Interface size': 'Μέγεθος διεπαφής', 'Small': 'Μικρό', 'Menus': 'Μενού', 'Across': 'Οριζόντια', 'Down the sides': 'Κάθετα στα πλάγια',
  'Show interface': 'Εμφάνιση διεπαφής', 'Show the interface (U)': 'Εμφάνιση διεπαφής (U)', 'Hide the interface (U)': 'Απόκρυψη διεπαφής (U)',
  'Hide the interface': 'Απόκρυψη διεπαφής', 'Make the panel bigger': 'Μεγαλύτερο πάνελ', 'Make the panel smaller': 'Μικρότερο πάνελ',
  'Hide or show the interface': 'Απόκρυψη ή εμφάνιση διεπαφής', 'Interface hidden. Press U to show it.': 'Η διεπαφή κρύφτηκε. Πατήστε U για να εμφανιστεί.',
  'Interface shown.': 'Η διεπαφή εμφανίστηκε.',
});
// Staff (1.10)
Object.assign(dict, {
  'Hire someone': 'Πρόσληψη κατοίκου', 'Manage staff': 'Διαχείριση προσωπικού', 'Let go': 'Απόλυση', 'Hire': 'Πρόσληψη',
  'looking for work': 'ψάχνει δουλειά', 'no schooling': 'χωρίς σχολείο', 'primary': 'δημοτικό', 'high school': 'λύκειο', 'degree': 'πτυχίο',
  'People you hire stay in the job until you let them go.': 'Όσοι προσλαμβάνετε μένουν στη θέση μέχρι να τους απολύσετε.',
  'Nobody in town has the education. Recruit from outside, or let adults study at a library’s evening classes.': 'Κανείς στην πόλη δεν έχει τη μόρφωση. Φέρτε κάποιον απ’ έξω ή αφήστε τους ενήλικες να σπουδάσουν στα βραδινά μαθήματα της βιβλιοθήκης.',
});
const hour = (h, ap) => (h === 'noon' ? 'μεσημέρι' : h === 'midnight' ? 'μεσάνυχτα' : `${h} ${ap === 'am' ? 'π.μ.' : 'μ.μ.'}`);
// Text with numbers in it. Each is [pattern, replacement].
const patterns = [
  [/^([+−])\$([\d,]+) a day$/, '$1$$$2/ημέρα'],
  [/^(\d+) homes$/, '$1 σπίτια'],
  [/^(\d+) queued$/, '$1 σε αναμονή'],
  [/^(\d+|noon|midnight) ?(am|pm)?, (Spring|Summer|Autumn|Winter) (\d+), Year (\d+)$/, (m, h, ap, se, d, y) => `${hour(h, ap)}, ${SEASON[se]} ${d}, Έτος ${y}`],
  [/^Level (\d)$/, 'Επίπεδο $1'],
  [/^Day (\d+)$/, 'Ημέρα $1'],
  [/^Needs (\d+) people$/, 'Χρειάζεται $1 κατοίκους'],
  [/^(\d+) of (\d+)$/, '$1 από $2'],
  [/^(\d+) people$/, '$1 κάτοικοι'],
  [/^Achievements (\d+)\/(\d+)$/, 'Επιτεύγματα $1/$2'],
  [/^Alerts ?(\d*)$/, 'Ειδοποιήσεις $1'],
  [/^Borrow \$([\d,]+)$/, 'Δανεισμός $$$1'],
  [/^Upgrade for \$([\d,]+)$/, 'Αναβάθμιση για $$$1'],
  [/^Move for \$([\d,]+)$/, 'Μετακίνηση για $$$1'],
  [/^Collect \$([\d,]+)$/, 'Εισπράξτε $$$1'],
  [/^Mayor level (\d+)$/, 'Επίπεδο δημάρχου $1'],
  [/^Build on tile (\d+), (\d+)$/, 'Χτίσιμο στο τετράγωνο $1, $2'],
  [/^Tile (\d+), (\d+)$/, 'Τετράγωνο $1, $2'],
  [/^Recruit from outside, \$([\d,]+)$/, 'Πρόσληψη απ’ έξω, $$$1'],
  [/^Hire a (.+)$/, 'Πρόσληψη: $1'],
];

export default { dict, patterns };
