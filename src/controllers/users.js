const { isValidObjectId } = require("mongoose");

const { getToken } = require("../middlewares/authenticator");
const { usersModel, profilesModel, passwordTokensModel } = require("../models");
const profilesController = require("./profiles");
const NodeMailer = require("../utils/NodeMailer");

/**
 * Signup user
 * @param {string} username user username
 * @param {string} email user email address
 * @param {string} password user password
 * @param {string} phone user phone number
 * @param {string} type user type
 * @returns {object} user data with token
 */
exports.signup = async (parameters) => {
	try {
		const { username, email, password, phone, type } = parameters;
		const userObj = {};
		if (username) userObj.username = username;
		if (email) userObj.email = email;
		if (type) userObj.type = type;
		if (phone) userObj.phone = phone;
		var user = await usersModel.register(new usersModel(userObj), password);
		const profileObj = {};
		profileObj.user = user._id;
		const profile = await profilesModel.create(profileObj);
		user.profile = profile._id;
		await user.save();
		const token = getToken({ _id: user._id });
		return {
			success: true,
			user: await usersModel.findOne({ _id: user._id }).populate("profile"),
			token,
		};
	} catch (error) {
		if (user) await user.remove();
		throw error;
	}
};

/**
 * Login user
 * @param {string} user user id
 * @param {string} phone user phone number
 * @param {string} type user type
 * @returns {object} user data with token
 */
exports.login = async (parameters) => {
	const { user, phone } = parameters;
	const query = { status: "active" };
	if (phone) query.phone = phone;
	else if (user) query._id = user;
	const userExists = await usersModel.findOne(query).populate("profile");
	if (userExists) {
	} else throw new Error("User deleted!");

	const token = getToken({ _id: userExists._id });
	return {
		success: true,
		user: userExists,
		token,
	};
};

/**
 * Update user
 * @param {string} user user id
 * @param {string} phone OPTIONAL user phone number
 * @param {string} status OPTIONAL user status
 * @param {string} fcm OPTIONAL user firebase cloud messaging token
 * @param {string} device OPTIONAL user device id
 * @param {string} email OPTIONAL user email address
 * @param {string} newPassword OPTIONAL user new password
 * @param {string} name OPTIONAL user name
 * @param {string} firstname OPTIONAL user first name
 * @param {string} lastname OPTIONAL user last name
 * @param {date} birthdate OPTIONAL user birthdate
 * @param {number} longitude OPTIONAL user location longitude
 * @param {number} latitude OPTIONAL user location latitude
 * @param {string} address OPTIONAL user address
 * @param {boolean} removePicture OPTIONAL user profile picture removal option
 * @param {[object]} picture OPTIONAL user profile picture
 * @returns {object} user data
 */
exports.editUserProfile = async (parameters) => {
	const {
		user,
		phone,
		status,
		fcm,
		device,
		email,
		newPassword,
		name,
		firstname,
		lastname,
		birthdate,
		longitude,
		latitude,
		address,
		profilePicture,
		removePicture,
		picture,
	} = parameters;
	if (user) {
		if (isValidObjectId(user))
			if (await usersModel.exists({ _id: user })) {
			} else throw new Error("User not found!");
		else throw new Error("Please enter valid user id!");
	} else throw new Error("Please enter user id!");
	const updateUserObj = {
		user,
		phone,
		status,
		fcm,
		device,
		email,
		newPassword,
	};
	const updateProfileObj = {
		user,
		name,
		firstname,
		lastname,
		birthdate,
		longitude,
		latitude,
		address,
		profilePicture,
		removePicture,
		picture,
	};

	const responseUserUpdate = await profilesController.updateUser(updateUserObj);
	const responseProfileUpdate = await profilesController.updateProfile(
		updateProfileObj
	);
	return {
		success: responseProfileUpdate && responseUserUpdate,
		user: await usersModel.findOne({ _id: user }).populate("profile"),
	};
};

/**
 * Update user state
 * @param {string} user user id
 * @param {string} state user state
 * @returns {boolean} user state updation result
 */
exports.setState = async (parameters) => {
	const { user, state } = parameters;
	if (!user) throw new Error("Please enter user id!");
	if (!isValidObjectId(user)) throw new Error("Please enter valid user id!");
	if (state) {
		const update = await usersModel.updateOne(
			{ _id: user },
			{ state },
			{
				useFindAndModify: false,
				new: true,
				runValidators: true,
			}
		);
		return { success: update.modifiedCount == 0 ? false : true };
	}
	throw new Error("Please enter user state!");
};

/**
 * Get user data
 * @param {string} user user id
 * @returns {object} user data
 */
exports.getUser = async (parameters) => {
	const { user } = parameters;
	if (user)
		if (isValidObjectId(user)) {
			const response = await usersModel
				.findOne({ _id: user })
				.populate("profile");
			if (response)
				return {
					success: "true",
					user: response,
				};
			else throw new Error("User not found!");
		} else throw new Error("Please enter valid user id!");
	else throw new Error("Please enter user id!");
};

/**
 * Send reset password email
 * @param {string} email user email address
 * @returns {object} user password reset result
 */
exports.emailResetPassword = async (parameters) => {
	const { email } = parameters;
	const userExists = await usersModel.findOne({ email });
	if (userExists) {
	} else throw new Error("User with given email doesn't exist!");

	let passwordTokenExists = await passwordTokensModel.findOne({
		user: userExists._id,
	});
	if (passwordTokenExists) {
	} else {
		const passwordTokenObj = {};
		passwordTokenObj.user = userExists._id;
		passwordTokenObj.token = getToken({ _id: userExists._id });
		passwordTokenExists = await new passwordTokensModel(
			passwordTokenObj
		).save();
	}

	const link = `${process.env.BASE_URL}forgot-password/reset?user=${userExists._id}&token=${passwordTokenExists.token}`;
	const body = `
To reset your password, click on this link 
${link}
Link will expire in 10 minutes.

If you didn't do this, click here backendboilerplate@gmail.com`;
	await new NodeMailer().sendEmail(userExists.email, "Password reset", body);

	return {
		success: true,
		message: "Password reset link sent to your email address!",
	};
};

/**
 * Reset user password
 * @param {string} user user id
 * @param {string} password user password
 * @param {string} token reset password token
 * @returns {object} user password reset result
 */
exports.resetPassword = async (parameters) => {
	const { password, user, token } = parameters;

	const userExists = await usersModel.findById(user);
	if (userExists) {
	} else throw new Error("Invalid link!");

	const passwordTokenExists = await passwordTokensModel.findOne({
		user,
		token,
	});
	if (passwordTokenExists) {
	} else throw new Error("Invalid or expired link !");

	await userExists.setPassword(password);
	await userExists.save();
	await passwordTokenExists.delete();

	return { success: true, message: "Password reset sucessfully!" };
};

/**
 * Get users data
 * @param {string} user user id
 * @param {string} q search keyword
 * @param {number} limit messages limit
 * @param {number} page messages page number
 * @param {string} status user status
 * @param {string} type user type
 * @returns {[object]} array of users
 */
exports.getAllUsers = async (parameters) => {
	const { user, q, status, type } = parameters;
	let { page, limit } = parameters;
	const query = {};
	if (!limit) limit = 10;
	if (!page) page = 1;
	query._id = { $ne: user };
	if (type) query.type = type;
	if (status) query.status = status;
	if (q && q.trim() !== "") {
		var wildcard = [
			{
				$regexMatch: {
					input: "$profile.firstname",
					regex: q,
					options: "i",
				},
			},
			{
				$regexMatch: {
					input: "$profile.lastname",
					regex: q,
					options: "i",
				},
			},
			{
				$regexMatch: {
					input: "$phone",
					regex: q,
					options: "i",
				},
			},
			{
				$regexMatch: {
					input: "$email",
					regex: q,
					options: "i",
				},
			},
		];
	}
	const aggregation = [
		{ $match: query },
		{ $project: { hash: 0, salt: 0, type: 0 } },
		{
			$lookup: {
				from: "profiles",
				let: { profile: "$profile" },
				pipeline: [
					{
						$match: {
							$expr: {
								$and: [
									{
										$and: [{ $eq: ["$$profile", "$_id"] }],
									},
								],
							},
						},
					},
				],
				as: "profile",
			},
		},
		{ $unwind: { path: "$profile" } },
		{
			$match: {
				$expr: {
					$and: [
						{
							$or: wildcard ?? {},
						},
					],
				},
			},
		},
	];
	const users = await usersModel
		.aggregate(aggregation)
		.sort({ createdAt: -1 })
		.skip((page - 1) * limit)
		.limit(limit);

	aggregation.push(
		...[{ $group: { _id: null, count: { $sum: 1 } } }, { $project: { _id: 0 } }]
	);

	const totalCount = await usersModel.aggregate(aggregation);

	return {
		success: true,
		totalCount: totalCount[0]?.count ?? 0,
		totalPages: Math.ceil((totalCount[0]?.count ?? 0) / limit),
		users,
	};
};
